/* global api */
class envi_Cambridge {
    constructor(options) {
        this.options = options;
        this.maxexample = 2; // Số lượng ví dụ tối đa
        this.word = '';
    }

    async displayName() {
        // Cập nhật tên hiển thị cho phù hợp
        return 'Cambridge EN->VI Dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        // Chỉ gọi hàm findCambridge, loại bỏ findYoudao
        let results = await this.findCambridge(word);
        return results.filter(x => x); // Lọc kết quả rỗng (nếu có)
    }

    async findCambridge(word) {
        let notes = [];
        if (!word) return notes;

        // Hàm tiện ích để lấy text, giữ nguyên
        function T(node) {
            if (!node) return '';
            return node.innerText.trim();
        }

        // Thay đổi URL sang từ điển Anh-Việt
        let base = 'https://dictionary.cambridge.org/dictionary/english-vietnamese/';
        let url = base + encodeURIComponent(word); // Thay khoảng trắng bằng gạch nối theo URL Cambridge
        let doc = '';
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            console.error("Lỗi khi fetch hoặc parse trang Cambridge:", err);
            return []; // Trả về mảng rỗng nếu có lỗi
        }

        // Sử dụng selector phù hợp với trang Cambridge (có thể cần kiểm tra lại)
        // Selector gốc là '.pr .entry-body__el', cần kiểm tra xem có áp dụng cho trang EN-VI không
        // Thử dùng selector chung hơn cho các khối mục từ
        let entries = doc.querySelectorAll('.pr.entry-body__el') || doc.querySelectorAll('.entry-body__el');
        if (!entries || entries.length === 0) {
             // Thử selector khác nếu không tìm thấy
             entries = doc.querySelectorAll('.entry'); // Selector dự phòng
        }


        for (const entry of entries) {
            let definitions = [];
            let audios = [];

            // Lấy từ chính (headword)
            let expression = T(entry.querySelector('.headword .hw')) || T(entry.querySelector('.hw.dhw')) || word; // Thử nhiều selector

            // Lấy phiên âm và audio (giữ nguyên logic nhưng cập nhật selector nếu cần)
            let reading = '';
            let readings = entry.querySelectorAll('.pron .ipa'); // Giữ nguyên selector gốc, kiểm tra lại nếu cần
            if (readings && readings.length > 0) {
                let reading_uk = T(readings[0]);
                let reading_us = T(readings[1]); // Có thể không có đủ 2 phiên âm
                reading = reading_uk || reading_us ? `UK[${reading_uk}] US[${reading_us}]`.replace('[]', '').trim() : '';
            }

            let pos = T(entry.querySelector('.posgram')) || T(entry.querySelector('.pos.dpos')); // Thử selector POS
            pos = pos ? `<span class='pos'>${pos}</span>` : '';

            // Lấy audio (giữ nguyên logic selector, thay đổi base URL)
             let audioUKNode = entry.querySelector(".uk.dpron-i source[type='audio/mpeg']"); // Tìm source mp3
             audios[0] = audioUKNode ? 'https://dictionary.cambridge.org' + audioUKNode.getAttribute('src') : '';
             let audioUSNode = entry.querySelector(".us.dpron-i source[type='audio/mpeg']"); // Tìm source mp3
             audios[1] = audioUSNode ? 'https://dictionary.cambridge.org' + audioUSNode.getAttribute('src') : '';


            // Tìm các khối nghĩa (sense block)
            // Selector gốc là '.sense-body', kiểm tra xem có áp dụng không
            let senseBodies = entry.querySelectorAll('.sense-body') || entry.querySelectorAll('.pr.dsense'); // Thử nhiều selector

            for (const senseBody of senseBodies) {
                // Tìm các khối định nghĩa bên trong sense-body
                // Selector gốc là '.def-block', có thể cần thay đổi
                let defBlocks = senseBody.querySelectorAll('.def-block') || senseBody.querySelectorAll('.def.ddef_d.db'); // Thử nhiều selector

                for (const defBlock of defBlocks) {
                    // Lấy định nghĩa tiếng Anh
                    // Selector gốc: '.ddef_h .def'
                    let eng_tran = T(defBlock.querySelector('.ddef_h .def')) || T(defBlock.querySelector('.def.ddef_d.db'));
                    if (!eng_tran) continue; // Bỏ qua nếu không có định nghĩa tiếng Anh

                    // Lấy bản dịch tiếng Việt ***(Giả định selector là '.trans')***
                    // Selector gốc: '.def-body .trans'
                    let vie_tran = T(defBlock.querySelector('.def-body .trans')) || T(defBlock.querySelector('.trans.dtrans.dtrans-se.break-cj')); // Thử nhiều selector '.trans'
                    if (!vie_tran) {
                        // Nếu không tìm thấy ở vị trí thông thường, thử tìm trong .examp nếu là định nghĩa ngắn gọn
                        vie_tran = T(defBlock.querySelector('.examp .trans.dtrans.dtrans-se.break-cj'));
                    }


                    // Tạo HTML cho định nghĩa
                    let definition = '';
                    eng_tran = `<span class='eng_tran'>${eng_tran.replace(new RegExp(expression.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), `<b>${expression}</b>`)}</span>`;
                    // Chỉ thêm bản dịch Việt nếu có
                    vie_tran = vie_tran ? `<span class='vie_tran'>${vie_tran}</span>` : '';
                    let tran = `<span class='tran'>${eng_tran}${vie_tran}</span>`;
                    // Không còn phrasehead trong logic này, chỉ dùng POS
                    definition += `${pos}${tran}`;

                    // Lấy ví dụ (Examps)
                    // Selector gốc: '.def-body .examp'
                    let examps = defBlock.querySelectorAll('.def-body .examp') || defBlock.querySelectorAll('.examp.dexamp'); // Thử selector ví dụ
                    if (examps.length > 0 && this.maxexample > 0) {
                        definition += '<ul class="sents">';
                        let count = 0;
                        for (const examp of examps) {
                            if (count >= this.maxexample) break;
                            // Lấy câu ví dụ tiếng Anh (Selector gốc: '.eg')
                            let eng_examp = T(examp.querySelector('.eg'));
                            // Lấy bản dịch ví dụ tiếng Việt ***(Giả định selector là '.trans')***
                            let vie_examp = T(examp.querySelector('.trans.dtrans.dtrans-se.break-cj')); // Selector gốc: '.trans'

                            if (eng_examp) { // Chỉ thêm nếu có câu tiếng Anh
                                eng_examp = eng_examp.replace(new RegExp(expression.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), `<b>${expression}</b>`);
                                definition += `<li class='sent'><span class='eng_sent'>${eng_examp}</span>${vie_examp ? `<span class='vie_sent'>${vie_examp}</span>` : ''}</li>`; // Thêm vie_sent nếu có
                                count++;
                            }
                        }
                        definition += '</ul>';
                    }
                    // Chỉ thêm định nghĩa nếu có nội dung hợp lệ
                    if (definition.replace(/<[^>]*>/g, '').trim()) {
                        definitions.push(definition);
                    }

                }
            }
             // Chỉ thêm mục từ nếu có định nghĩa
             if (definitions.length > 0) {
                let css = this.renderCSS();
                notes.push({
                    css,
                    expression,
                    reading,
                    definitions,
                    audios
                });
            }
        }
        return notes;
    }

    // Hàm findYoudao đã bị xóa

    renderCSS() {
        // Cập nhật CSS để sử dụng lớp vie_tran và vie_sent
        return `
            <style>
                span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                span.tran {margin:0; padding:0;}
                span.eng_tran {margin-right:3px; padding:0;}
                span.vie_tran {color:#0d47a1;} /* Đã đổi chn thành vie */
                ul.sents {font-size:0.8em; list-style:square inside; margin:3px 0;padding:5px;background:rgba(13,71,161,0.1); border-radius:5px;}
                li.sent  {margin:0; padding:0;}
                span.eng_sent {margin-right:5px;}
                span.vie_sent {color:#0d47a1;} /* Đã đổi chn thành vie */
            </style>`;
    }
}