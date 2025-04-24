/* global api, hash */
class encn_Oxford {
    constructor(options) {
        this.token = '';
        this.gtk = '';
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        // Thay đổi tên hiển thị sang tiếng Việt
        return 'Từ điển Oxford Anh-Việt';
    }


    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    // Hàm getToken không thay đổi, giữ nguyên để lấy token từ Baidu Fanyi
    async getToken() {
        let homeurl = 'https://fanyi.baidu.com/';
        let homepage = await api.fetch(homeurl);
        let tmatch = /token: ['"](.+?)['"]/gi.exec(homepage);
        if (!tmatch || tmatch.length < 2) return null;
        let gmatch = /window.gtk = ['"](.+?)['"]/gi.exec(homepage);
        if (!gmatch || gmatch.length < 2) return null;
        return {
            'token': tmatch[1],
            'gtk': gmatch[1]
        };
    }

    async findTerm(word) {
        this.word = word;
        let deflection = await api.deinflect(word) || [];
        // Tìm cả dạng gốc và dạng biến đổi của từ
        let promises = [word, deflection].map(x => this.findOxford(x));
        let results = await Promise.all(promises);
        return [].concat(...results).filter(x => x);
    }

    async findOxford(word) {
        // Hàm trợ giúp để xây dựng khối định nghĩa
        function buildDefinitionBlock(exp, pos, defs) {
            if (!defs || !Array.isArray(defs) || defs.length < 0) return '';
            let definition = '';
            let sentence = '';
            let sentnum = 0;
            for (const def of defs) {
                // Giữ nguyên cấu trúc xử lý dữ liệu trả về,
                // giả định API trả về tiếng Việt trong các trường tương tự (chText)
                if (def.text) definition += `<span class='tran'><span class='eng_tran'>${def.text}</span></span>`;
                if (def.tag == 'id' || def.tag == 'pv')
                    definition += def.enText ? `<div class="idmphrase">${def.enText}</div>` : '';
                if (def.tag == 'd' || def.tag == 'ud')
                    // Sử dụng class chn_tran cho tiếng Việt để không cần sửa CSS quá nhiều
                    definition += pos + `<span class='tran'><span class='eng_tran'>${def.enText}</span><span class='chn_tran'>${def.chText}</span></span>`;
                if (def.tag == 'x' && sentnum < maxexample) {
                    sentnum += 1;
                    let enText = def.enText.replace(RegExp(exp, 'gi'), `<b>${exp}</b>`);
                     // Sử dụng class chn_sent cho tiếng Việt
                    sentence += `<li class='sent'><span class='eng_sent'>${enText}</span><span class='chn_sent'>${def.chText}</span></li>`;
                }
            }
            definition += sentence ? `<ul class="sents">${sentence}</ul>` : '';
            return definition;
        }
        const maxexample = this.maxexample;
        let notes = [];
        if (!word) return notes;

        // Thay đổi ngôn ngữ đích từ zh (tiếng Trung) sang vi (tiếng Việt)
        let base = 'https://fanyi.baidu.com/v2transapi?from=en&to=vi&simple_means_flag=3'; // Đổi 'to=zh' thành 'to=vi'

        if (!this.token || !this.gtk) {
            let common = await this.getToken();
            if (!common) return [];
            this.token = common.token;
            this.gtk = common.gtk;
        }

        let sign = hash(word, this.gtk);
        if (!sign) return;

        // URL không thay đổi cấu trúc, chỉ thay đổi tham số ngôn ngữ
        let dicturl = base + `&query=${word}&sign=${sign}&token=${this.token}`;
        let data = '';
        try {
            data = JSON.parse(await api.fetch(dicturl));
            // Các hàm xử lý dữ liệu trả về được giữ nguyên tên và cấu trúc,
            // hy vọng API Baidu trả về cấu trúc JSON tương tự cho tiếng Việt.
            let oxford = getOxford(data);
            let bdsimple = oxford.length ? [] : getBDSimple(data);
            let bstrans = oxford.length || bdsimple.length ? [] : getBDTrans(data);
            return [].concat(oxford, bdsimple, bstrans);

        } catch (err) {
             console.error("Lỗi khi gọi API hoặc xử lý JSON:", err); // Thêm log lỗi
            return [];
        }

        // Hàm này có thể không hoạt động đúng với tiếng Việt nếu API Baidu
        // không trả về 'trans_result' cho cặp Anh-Việt. Cần kiểm tra thực tế.
        function getBDTrans(data) {
            try {
                // Kiểm tra xem có kết quả dịch thông thường không
                 if (!data.trans_result || !data.trans_result.data || data.trans_result.data.length < 1) return [];

                // Bỏ qua nếu có kết quả từ điển chi tiết (ưu tiên từ điển)
                if (data.dict_result && data.dict_result.length != 0 && data.dict_result.oxford) return []; // Kiểm tra oxford để chắc chắn hơn


                let css = '<style>.odh-expression {font-size: 1em!important;font-weight: normal!important;}</style>';
                let expression = data.trans_result.data[0].src;
                let definition = data.trans_result.data[0].dst; // Đây sẽ là bản dịch tiếng Việt
                return [{ css, expression, definitions: [definition] }];
            } catch (error) {
                 console.error("Lỗi trong getBDTrans:", error);
                return [];
            }
        }

        // Hàm này có thể cần điều chỉnh dựa trên cấu trúc JSON trả về cho tiếng Việt.
        // Các trường như ph_en, ph_am (phiên âm) có thể vẫn giữ nguyên.
        function getBDSimple(data) {
            try {
                 // Đảm bảo rằng chúng ta chỉ xử lý khi không có kết quả từ điển Oxford
                 if (!data.dict_result || !data.dict_result.simple_means || (data.dict_result.oxford && data.dict_result.oxford.entry)) return [];

                let simple = data.dict_result.simple_means;
                let expression = simple.word_name;
                if (!expression) return [];

                let symbols = simple.symbols && simple.symbols.length > 0 ? simple.symbols[0] : {};
                let reading_uk = symbols.ph_en || '';
                let reading_us = symbols.ph_am || '';
                let reading = reading_uk || reading_us ? `uk[${reading_uk}] us[${reading_us}]` : ''; // Chỉ hiển thị nếu có phiên âm

                let audios = [];
                 // Giữ nguyên link audio tiếng Anh
                if (reading_uk) audios.push(`https://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(expression)}&spd=3&source=web`);
                if (reading_us) audios.push(`https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(expression)}&spd=3&source=web`);


                if (!symbols.parts || symbols.parts.length < 1) return [];
                let definition = '<ul class="ec">';
                for (const def of symbols.parts)
                    if (def.means && def.means.length > 0) {
                        let pos = def.part || def.part_name || '';
                        pos = pos ? `<span class="pos simple">${pos}</span>` : '';
                         // 'means' bây giờ sẽ chứa các nghĩa tiếng Việt
                        definition += `<li class="ec">${pos}<span class="ec_chn">${def.means.join(', ')}</span></li>`; // Nối các nghĩa bằng dấu phẩy
                    }
                definition += '</ul>';
                let css = `<style>
                ul.ec, li.ec {margin:0; padding:0; list-style: none;}
                span.simple {background-color: #999!important}
                span.pos {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                span.ec_chn { color: #0d47a1; } /* Thêm màu cho nghĩa tiếng Việt nếu cần */
                </style>`;
                notes.push({ css, expression, reading, definitions: [definition], audios });
                return notes;
            } catch (error) {
                 console.error("Lỗi trong getBDSimple:", error);
                return [];
            }
        }

        // Hàm này quan trọng nhất, xử lý kết quả từ điển Oxford chi tiết.
        // Cần kiểm tra kỹ lưỡng cấu trúc JSON trả về khi API đích là tiếng Việt.
        function getOxford(data) {
             try {
                 // Kiểm tra xem có dữ liệu từ điển Oxford không
                 if (!data.dict_result || !data.dict_result.oxford || !data.dict_result.oxford.entry || data.dict_result.oxford.entry.length === 0) {
                     return []; // Không có dữ liệu Oxford
                 }

                let simple = data.dict_result.simple_means; // Vẫn lấy phiên âm từ simple_means
                let expression = simple.word_name;
                if (!expression) return [];

                let symbols = simple.symbols && simple.symbols.length > 0 ? simple.symbols[0] : {};
                let reading_uk = symbols.ph_en || '';
                let reading_us = symbols.ph_am || '';
                 let reading = reading_uk || reading_us ? `uk[${reading_uk}] us[${reading_us}]` : '';

                let audios = [];
                if (reading_uk) audios.push(`https://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(expression)}&spd=3&source=web`);
                if (reading_us) audios.push(`https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(expression)}&spd=3&source=web`);


                let entries = data.dict_result.oxford.entry[0].data;
                if (!entries) return [];

                let definitions = [];
                for (const entry of entries) {
                    // Xử lý các nhóm định nghĩa (p-g, h-g)
                    if (entry.tag == 'p-g' || entry.tag == 'h-g') {
                        let pos = ''; // Từ loại
                        for (const group of entry.data) {
                             let definition = '';
                            if (group.tag == 'p') { // Lấy từ loại
                                pos = `<span class='pos'>${group.p_text}</span>`;
                            }
                             // Định nghĩa chính (d)
                            if (group.tag == 'd') {
                                 // group.enText là nghĩa tiếng Anh, group.chText giờ sẽ là nghĩa tiếng Việt
                                definition += pos + `<span class='tran'><span class='eng_tran'>${group.enText}</span><span class='chn_tran'>${group.chText}</span></span>`;
                                definitions.push(definition);
                            }
                            // Nhóm định nghĩa con (n-g)
                            if (group.tag == 'n-g') {
                                definition += buildDefinitionBlock(expression, pos, group.data);
                                definitions.push(definition);
                            }

                            // Các nhóm định nghĩa phức tạp hơn (sd-g, ids-g, pvs-g)
                            if (group.tag == 'sd-g' || group.tag == 'ids-g' || group.tag == 'pvs-g') {
                                for (const item of group.data) {
                                    // Giải thích thêm (sd)
                                    if (item.tag == 'sd') definition = `<div class="dis"><span class="eng_dis">${item.enText}</span><span class="chn_dis">${item.chText}</span></div>` + definition; // chn_dis sẽ là tiếng Việt
                                    let defs = [];
                                     // Các nhóm con chứa định nghĩa và ví dụ
                                    if (item.tag == 'n-g' || item.tag == 'id-g' || item.tag == 'pv-g') defs = item.data;
                                    if (item.tag == 'vrs' || item.tag == 'xrs') defs = item.data[0].data; // Cấu trúc ví dụ có thể khác
                                    definition += buildDefinitionBlock(expression, pos, defs);
                                }
                                definitions.push(definition);
                            }
                        }
                    }
                }
                let css = encn_Oxford.renderCSS(); // Giữ nguyên CSS
                notes.push({ css, expression, reading, definitions, audios });
                return notes;
            } catch (error) {
                 console.error("Lỗi trong getOxford:", error);
                return [];
            }

        }

    }

    // Giữ nguyên CSS, vì các class được tái sử dụng cho tiếng Việt
    static renderCSS() {
        let css = `
            <style>
                div.dis {font-weight: bold;margin-bottom:3px;padding:0;}
                span.grammar,
                span.informal   {margin: 0 2px;color: #0d47a1;}
                span.complement {margin: 0 2px;font-weight: bold;}
                div.idmphrase {font-weight: bold;margin: 0;padding: 0;}
                span.eng_dis  {margin-right: 5px;}
                span.chn_dis  {margin: 0;padding: 0;} /* Kiểu cho giải thích tiếng Việt */
                span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                span.tran {margin:0; padding:0;}
                span.eng_tran {margin-right:3px; padding:0;}
                span.chn_tran {color:#0d47a1;} /* Kiểu cho nghĩa tiếng Việt */
                ul.sents {font-size:0.9em; list-style:square inside; margin:3px 0;padding:5px;background:rgba(13,71,161,0.1); border-radius:5px;}
                li.sent  {margin:0; padding:0;}
                span.eng_sent {margin-right:5px;}
                span.chn_sent {color:#0d47a1;} /* Kiểu cho câu ví dụ tiếng Việt */
            </style>`;
        return css;
    }
}