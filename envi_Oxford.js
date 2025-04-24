/* global api, hash */
class envi_Oxford {
    constructor(options) {
        this.token = '';
        this.gtk = '';
        this.options = options;
        this.maxexample = 2; // Giới hạn số lượng ví dụ
        this.word = '';
    }

    async displayName() {
        // Tên hiển thị có thể được địa phương hóa nếu cần
        return 'Oxford EN->VI Dictionary (via Baidu API)';
    }


    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    // Hàm getToken giữ nguyên từ script gốc
    async getToken() {
        let homeurl = 'https://fanyi.baidu.com/';
        let homepage = await api.fetch(homeurl);
        // Sử dụng biểu thức chính quy an toàn hơn
        let tmatch = /token:\s*'([^']+)'/g.exec(homepage);
        let gmatch = /window.gtk\s*=\s*'([^']+)'/g.exec(homepage);

        if (!tmatch || tmatch.length < 2 || !gmatch || gmatch.length < 2) {
            console.error("Không thể lấy token hoặc gtk từ Baidu Fanyi.");
            return null;
        }
        return {
            'token': tmatch[1],
            'gtk': gmatch[1]
        };
    }

    async findTerm(word) {
        this.word = word;
        // Hàm deinflect giữ nguyên
        let deflection = await api.deinflect(word) || word; // Sử dụng từ gốc nếu không tìm thấy dạng nguyên thể
        // Chỉ tìm từ gốc hoặc dạng nguyên thể đơn giản nhất để tránh lỗi API không cần thiết
        let termToSearch = (typeof deflection === 'string') ? deflection : (Array.isArray(deflection) && deflection.length > 0 ? deflection[0] : word);
        if (!termToSearch) termToSearch = word; // Đảm bảo luôn có từ để tìm kiếm

        return this.findOxford(termToSearch.toLowerCase()); // Tìm kiếm dạng chữ thường
    }


    async findOxford(word) {
        const maxexample = this.maxexample;
        let notes = [];
        if (!word) return notes;

        // Thay đổi 'to=zh' thành 'to=vie'
        let base = 'https://fanyi.baidu.com/v2transapi?from=en&to=vie&simple_means_flag=3'; // Đã đổi sang vie

        if (!this.token || !this.gtk) {
            let common = await this.getToken();
            if (!common) {
                 console.error("Lỗi lấy token/gtk.");
                 return []; // Trả về mảng rỗng nếu không lấy được token
            }
            this.token = common.token;
            this.gtk = common.gtk;
        }

        // Hàm hash cần được cung cấp hoặc giữ nguyên từ môi trường gốc
        // Giả sử hàm hash() tồn tại trong môi trường thực thi
        if (typeof hash !== 'function') {
             console.error("Hàm hash không tồn tại.");
             return []; // Cần hàm hash để tạo sign
        }
        let sign = hash(word, this.gtk);
        if (!sign) {
             console.error("Không thể tạo sign.");
             return [];
        }


        let dicturl = `${base}&query=${encodeURIComponent(word)}&sign=${sign}&token=${this.token}`;
        let data;
        try {
            let response = await api.fetch(dicturl);
            data = JSON.parse(response);

            // Kiểm tra lỗi từ API Baidu
             if (data.error) {
                 console.error("API Baidu trả về lỗi:", data.error);
                 return [];
            }


            // Ưu tiên lấy bản dịch chung trước vì có khả năng cao nhất
            let bstrans = this.getBDTrans(data, word);
             if (bstrans && bstrans.length > 0) {
                 // Nếu có bản dịch chung, thử tìm thêm định nghĩa Oxford và simple_means
                 let oxford = this.getOxford(data, word);
                 let bdsimple = this.getBDSimple(data, word);
                 // Kết hợp kết quả, ưu tiên Oxford > Simple > Trans
                 return [].concat(oxford, bdsimple, bstrans);
             } else {
                 // Nếu không có bản dịch chung, thử tìm Oxford và simple_means
                 let oxford = this.getOxford(data, word);
                 let bdsimple = this.getBDSimple(data, word);
                  // Nếu có Oxford hoặc Simple, trả về chúng
                 if (oxford.length > 0 || bdsimple.length > 0) {
                      return [].concat(oxford, bdsimple);
                  }
                 // Nếu không có gì cả, trả về mảng rỗng
                 return [];
             }


        } catch (err) {
            console.error("Lỗi khi gọi API hoặc phân tích JSON:", err);
            return [];
        }
    }

    // --- Helper functions ---

    // Cố gắng lấy bản dịch chung (khả năng thành công cao nhất)
    getBDTrans(data, expression) {
        try {
             // Chỉ lấy bản dịch nếu không có kết quả từ điển chi tiết hơn (có thể tùy chỉnh logic này)
            if (data.dict_result && data.dict_result.length !== 0 && (data.dict_result.oxford || data.dict_result.simple_means)) {
                 // console.log("Đã có kết quả từ điển chi tiết, bỏ qua bản dịch chung.");
                 return [];
             }
            if (!data.trans_result || !data.trans_result.data || data.trans_result.data.length < 1 || !data.trans_result.data[0].dst) {
                // console.log("Không tìm thấy bản dịch chung.");
                return [];
            }

            let css = '<style>.odh-expression {font-size: 1em!important;font-weight: normal!important;}</style>'; // CSS đơn giản
            let definition = data.trans_result.data[0].dst; // Lấy bản dịch tiếng Việt
            // console.log("Đã tìm thấy bản dịch chung:", definition);
            return [{ css, expression, definitions: [definition] }];
        } catch (error) {
            console.error("Lỗi trong getBDTrans:", error);
            return [];
        }
    }


    // Cố gắng lấy định nghĩa "simple means" (khả năng thành công thấp hơn)
     getBDSimple(data, word) {
        let notes = [];
         try {
             if (!data.dict_result || !data.dict_result.simple_means) {
                 // console.log("Không có simple_means trong dữ liệu.");
                 return notes; // Không có simple_means
             }
             let simple = data.dict_result.simple_means;
             let expression = simple.word_name || word;
             if (!expression) return notes;


             let symbols = simple.symbols && simple.symbols.length > 0 ? simple.symbols[0] : null;
            let reading = '';
            let audios = [];

             if (symbols) {
                 let reading_uk = symbols.ph_en || '';
                 let reading_us = symbols.ph_am || '';
                 // Chỉ thêm reading nếu có
                if (reading_uk || reading_us) {
                    reading = `${reading_uk ? `UK[${reading_uk}]` : ''} ${reading_us ? `US[${reading_us}]` : ''}`.trim();
                }
                 // Giữ nguyên link audio
                audios[0] = symbols.tts_mp3 || `https://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(expression)}&spd=3&source=web`;
                audios[1] = symbols.tts_mp3_am || `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(expression)}&spd=3&source=web`;
            }

             if (!symbols || !symbols.parts || symbols.parts.length < 1) {
                 // console.log("Không có 'parts' trong simple_means.");
                 return notes;
             }


             let definition = '<ul class="ec">';
             for (const part of symbols.parts) {
                 if (part.means && part.means.length > 0) {
                    let pos = part.part || part.part_name || '';
                    pos = pos ? `<span class="pos simple">${pos}</span>` : '';
                     // Giả sử 'means' chứa các bản dịch tiếng Việt hoặc một mảng các string/object
                    let meanings = '';
                    if (Array.isArray(part.means)) {
                        meanings = part.means.map(m => (typeof m === 'object' && m.text) ? m.text : m).join('; '); // Lấy text nếu là object
                    } else if (typeof part.means === 'string') {
                        meanings = part.means;
                    }
                    if (meanings) {
                        definition += `<li class="ec">${pos}<span class="ec_vie">${meanings}</span></li>`; // Dùng class ec_vie
                    }
                 }
             }
             definition += '</ul>';

             if (definition === '<ul class="ec"></ul>') {
                 // console.log("Không tạo được định nghĩa từ simple_means parts.");
                 return notes; // Không có định nghĩa hợp lệ được tạo ra
             }


             let css = this.renderCSSSimple(); // CSS riêng cho simple
            notes.push({ css, expression, reading, definitions: [definition], audios });
            // console.log("Đã xử lý xong getBDSimple.");
            return notes;
         } catch (error) {
             console.error("Lỗi trong getBDSimple:", error);
             return [];
         }
     }


    // Cố gắng lấy định nghĩa chi tiết Oxford (khả năng thành công rất thấp cho tiếng Việt)
     getOxford(data, word) {
        const maxexample = this.maxexample;
        let notes = [];
         try {
             if (!data.dict_result || !data.dict_result.oxford || !data.dict_result.oxford.entry || data.dict_result.oxford.entry.length === 0) {
                  // console.log("Không có dữ liệu Oxford trong phản hồi.");
                  return notes;
             }


             // Giữ nguyên logic lấy expression, reading, audios từ simple_means nếu có
             let expression = data.dict_result.simple_means?.word_name || word;
             let symbols = data.dict_result.simple_means?.symbols?.[0];
             let reading = '';
             let audios = [];
              if (symbols) {
                 let reading_uk = symbols.ph_en || '';
                 let reading_us = symbols.ph_am || '';
                  if (reading_uk || reading_us) {
                     reading = `${reading_uk ? `UK[${reading_uk}]` : ''} ${reading_us ? `US[${reading_us}]` : ''}`.trim();
                 }
                 audios[0] = symbols.tts_mp3 || `https://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(expression)}&spd=3&source=web`;
                 audios[1] = symbols.tts_mp3_am || `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(expression)}&spd=3&source=web`;
             }


             let entries = data.dict_result.oxford.entry[0].data;
             if (!entries) {
                  // console.log("Không có 'entries' trong dữ liệu Oxford.");
                  return notes;
             }


             let definitions = [];
             // Hàm buildDefinitionBlock cần được định nghĩa bên trong hoặc truyền vào
             const buildDefinitionBlock = (exp, pos, defs) => {
                 if (!defs || !Array.isArray(defs) || defs.length === 0) return '';
                 let definition = '';
                 let sentence = '';
                 let sentnum = 0;
                 for (const def of defs) {
                     // Ưu tiên hiển thị định nghĩa tiếng Anh (enText) và tiếng Việt (viText - phỏng đoán)
                    let engText = def.enText || '';
                    // **Phỏng đoán tên trường tiếng Việt là 'viText' hoặc 'chText' (nếu API không đổi tên)**
                    let vieText = def.viText || def.chText || '';
                     let textToShow = engText;
                      if (vieText) {
                         textToShow += ` <span class='vie_tran'>${vieText}</span>`; // Thêm bản dịch Việt nếu có
                     }


                     if (def.text && !engText && !vieText) { // Trường hợp chỉ có 'text'
                        definition += `<span class='tran'><span class='eng_tran'>${def.text}</span></span>`;
                    } else if (textToShow) {
                         // Xử lý các tag đặc biệt (id, pv, d, ud) tương tự bản gốc
                        if (def.tag == 'id' || def.tag == 'pv') {
                            definition += `<div class="idmphrase">${engText}${vieText ? ` <span class='vie_tran'>${vieText}</span>` : ''}</div>`;
                         } else if (def.tag == 'd' || def.tag == 'ud') {
                             definition += pos + `<span class='tran'><span class='eng_tran'>${engText}</span>${vieText ? `<span class='vie_tran'>${vieText}</span>` : ''}</span>`;
                         } else {
                             // Trường hợp khác, chỉ hiển thị text
                             definition += `<span class='tran'>${textToShow}</span>`;
                         }
                     }


                     // Xử lý ví dụ (tag 'x')
                     if (def.tag == 'x' && sentnum < maxexample) {
                         // **Phỏng đoán tên trường ví dụ tiếng Việt là 'viText' hoặc 'chText'**
                        let engSent = def.enText ? def.enText.replace(new RegExp(exp.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), `<b>${exp}</b>`) : '';
                        let vieSent = def.viText || def.chText || ''; // Phỏng đoán
                        if (engSent) { // Chỉ thêm ví dụ nếu có câu tiếng Anh
                            sentnum += 1;
                             sentence += `<li class='sent'><span class='eng_sent'>${engSent}</span>${vieSent ? `<span class='vie_sent'>${vieSent}</span>` : ''}</li>`; // Dùng class vie_sent
                         }
                     }
                 }
                 definition += sentence ? `<ul class="sents">${sentence}</ul>` : '';
                 return definition;
             };


             for (const entry of entries) {
                 if (entry.tag == 'p-g' || entry.tag == 'h-g') {
                     let pos = '';
                     for (const group of entry.data) {
                         let definition = '';
                         if (group.tag == 'p') {
                             pos = group.p_text ? `<span class='pos'>${group.p_text}</span>` : '';
                         }


                         // Xử lý các loại group khác nhau tương tự gốc
                        if (group.tag == 'd' || group.tag == 'n-g' || group.tag == 'sd-g' || group.tag == 'ids-g' || group.tag == 'pvs-g') {
                             let currentDefs = [];
                              // Lấy dữ liệu định nghĩa tùy theo tag
                             if (group.tag === 'd') {
                                 currentDefs = [group]; // 'd' là một định nghĩa đơn lẻ
                             } else if (group.tag === 'n-g' || group.tag === 'sd-g' || group.tag === 'ids-g' || group.tag === 'pvs-g') {
                                  // Các group này chứa một mảng các định nghĩa/ví dụ bên trong 'data'
                                 if (Array.isArray(group.data)) {
                                     // Xử lý trường hợp đặc biệt như 'sd' nằm ngoài 'n-g'
                                     if (group.tag === 'sd-g') {
                                         for (const item of group.data) {
                                             if (item.tag === 'sd') {
                                                 let engDis = item.enText || '';
                                                 let vieDis = item.viText || item.chText || ''; // Phỏng đoán
                                                 definition += `<div class="dis"><span class="eng_dis">${engDis}</span>${vieDis ? `<span class="chn_dis">${vieDis}</span>` : ''}</div>`; // class chn_dis giữ nguyên hoặc đổi?
                                             } else if (item.tag === 'n-g' || item.tag === 'id-g' || item.tag === 'pv-g') {
                                                  if (Array.isArray(item.data)) currentDefs.push(...item.data);
                                             } else if (item.tag === 'vrs' || item.tag === 'xrs') {
                                                 if (Array.isArray(item.data) && item.data[0] && Array.isArray(item.data[0].data)) {
                                                     currentDefs.push(...item.data[0].data);
                                                 }
                                             }
                                         }
                                     } else {
                                         currentDefs = group.data; // Các group khác chứa trực tiếp trong data
                                     }
                                 }
                              } else if (group.tag === 'vrs' || group.tag === 'xrs') {
                                 // Các group này có cấu trúc data[0].data
                                if (Array.isArray(group.data) && group.data[0] && Array.isArray(group.data[0].data)) {
                                    currentDefs = group.data[0].data;
                                }
                             }

                             // Xây dựng khối định nghĩa từ dữ liệu đã thu thập
                             if (currentDefs.length > 0) {
                                 definition += buildDefinitionBlock(expression, pos, currentDefs);
                             }
                         }


                         if (definition) { // Chỉ thêm nếu có nội dung
                            definitions.push(definition);
                        }
                     }
                 }
             }


             if (definitions.length === 0) {
                 // console.log("Không tạo được định nghĩa nào từ dữ liệu Oxford.");
                 return notes;
             }


             let css = this.renderCSSOxford(); // CSS riêng cho Oxford
            notes.push({ css, expression, reading, definitions, audios });
            // console.log("Đã xử lý xong getOxford.");
            return notes;
         } catch (error) {
             console.error("Lỗi trong getOxford:", error);
             return [];
         }
     }

    // --- CSS Rendering ---

    renderCSSSimple() {
        // CSS cho phần simple means
        return `
            <style>
                ul.ec, li.ec {margin:0; padding:0; list-style: none;}
                span.simple {background-color: #999!important; margin-right: 5px;} /* Style cho POS của simple */
                span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                span.ec_vie { color: #0d47a1; /* Màu cho nghĩa tiếng Việt */ }
            </style>`;
    }

    renderCSSOxford() {
         // Giữ nguyên CSS từ gốc và thay thế các class liên quan đến tiếng Trung (_chn_) bằng tiếng Việt (_vie_)
        return `
            <style>
                div.dis {font-weight: bold;margin-bottom:3px;padding:0;}
                span.grammar,
                span.informal   {margin: 0 2px;color: #0d47a1;}
                span.complement {margin: 0 2px;font-weight: bold;}
                div.idmphrase {font-weight: bold;margin: 0;padding: 0;}
                span.eng_dis  {margin-right: 5px;}
                span.vie_dis  {margin: 0;padding: 0; color: #0d47a1;} /* Đã đổi chn thành vie */
                span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                span.tran {margin:0; padding:0;}
                span.eng_tran {margin-right:3px; padding:0;}
                span.vie_tran {color:#0d47a1;} /* Đã đổi chn thành vie */
                ul.sents {font-size:0.9em; list-style:square inside; margin:3px 0;padding:5px;background:rgba(13,71,161,0.1); border-radius:5px;}
                li.sent  {margin:0; padding:0;}
                span.eng_sent {margin-right:5px;}
                span.vie_sent {color:#0d47a1;} /* Đã đổi chn thành vie */
            </style>`;
    }
}

// Lưu ý: Hàm hash(word, gtk) cần được định nghĩa ở đâu đó trong môi trường thực thi của bạn.
// Ví dụ về hàm hash (lấy từ các nguồn online, cần kiểm tra tính chính xác):
/*
function hash(r, o) {
    // Đây là một ví dụ, bạn cần đảm bảo hàm hash này đúng với yêu cầu của API Baidu
    // Hàm hash thực tế có thể phức tạp hơn và có thể thay đổi.
    var t = r.length;
    t > 30 && (r = "" + r.substr(0, 10) + r.substr(Math.floor(t / 2) - 5, 10) + r.substr(-10, 10));
    var n = "" + String.fromCharCode(103) + String.fromCharCode(116) + String.fromCharCode(107); // "gtk"
    var e = (null !== o ? o : "") || "";
    for (var i = e.split("."), a = Number(i[0]) || 0, s = Number(i[1]) || 0, c = [], u = 0, l = 0; l < t; l++) {
        var p = r.charCodeAt(l);
        128 > p ? c[u++] = p : (2048 > p ? c[u++] = p >> 6 | 192 : (55296 == (64512 & p) && l + 1 < t && 56320 == (64512 & r.charCodeAt(l + 1)) ? (p = 65536 + ((1023 & p) << 10) + (1023 & r.charCodeAt(++l)), c[u++] = p >> 18 | 240, c[u++] = p >> 12 & 63 | 128) : c[u++] = p >> 12 | 224, c[u++] = p >> 6 & 63 | 128), c[u++] = 63 & p | 128)
    }
    for (var d = a, f = "" + String.fromCharCode(43) + String.fromCharCode(45) + String.fromCharCode(97) + ("" + String.fromCharCode(94) + String.fromCharCode(43) + String.fromCharCode(54)), h = "" + String.fromCharCode(43) + String.fromCharCode(45) + String.fromCharCode(51) + ("" + String.fromCharCode(94) + String.fromCharCode(43) + String.fromCharCode(98)) + ("" + String.fromCharCode(43) + String.fromCharCode(45) + String.fromCharCode(102)), m = 0; m < c.length; m++) d += c[m], d = function(r, o) {
        for (var t = 0; t < o.length - 2; t += 3) {
            var n = o.charAt(t + 2);
            n = n >= "a" ? n.charCodeAt(0) - 87 : Number(n), n = "+" == o.charAt(t + 1) ? r >>> n : r << n, r = "+" == o.charAt(t) ? r + n & 4294967295 : r ^ n
        }
        return r
    }(d, f);
    return d ^= s, 0 > d && (d = (2147483647 & d) + 2147483648), d %= 1e6, d.toString() + "." + (d ^ a)
}
*/