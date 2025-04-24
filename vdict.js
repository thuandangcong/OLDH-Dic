/* global api */
class enen_Vietnamese {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('VN') != -1) return 'Từ điển Anh-Việt';
        return 'English-Vietnamese Dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        let results = await Promise.all([
            this.findVDict(word),
            this.findTraTuDien(word)
        ]);
        return [].concat(...results).filter(x => x);
    }

    async findVDict(word) {
        let notes = [];
        if (!word) return notes;

        function T(node) {
            return node ? node.innerText.trim() : '';
        }

        let url = `https://vdict.com/${encodeURIComponent(word)},1,0,0.html`;
        try {
            let data = await api.fetch(url);
            let doc = new DOMParser().parseFromString(data, 'text/html');
            
            // Xử lý phần phát âm
            let expression = T(doc.querySelector('#content .word'));
            let reading = T(doc.querySelector('#content .phonetic'));
            
            // Xử lý nghĩa
            let definitions = [];
            let meaningBlocks = doc.querySelectorAll('#content #bodyContent > div:not(.footer)');
            
            meaningBlocks.forEach(block => {
                let pos = T(block.querySelector('h2')) || '';
                let lis = block.querySelectorAll('li');
                if (lis.length > 0) {
                    let html = `<div class="vdict-block">`;
                    if (pos) html += `<span class="pos">${pos}</span>`;
                    html += `<ul>`;
                    lis.forEach(li => {
                        let content = li.innerHTML.split('<br>')[0]; // Lấy phần đầu tiên
                        html += `<li>${content}</li>`;
                    });
                    html += `</ul></div>`;
                    definitions.push(html);
                }
            });

            let css = `
                <style>
                    .pos {
                        color: #d32f2f;
                        font-weight: bold;
                        display: block;
                        margin: 5px 0;
                    }
                    .vdict-block ul {
                        margin: 5px 0;
                        padding-left: 20px;
                    }
                    .vdict-block li {
                        margin: 3px 0;
                        color: #2e7d32;
                    }
                </style>`;

            if (expression) {
                notes.push({
                    css,
                    expression,
                    reading: reading ? `[${reading}]` : '',
                    definitions,
                    audios: []
                });
            }
        } catch (err) {
            console.error(err);
        }
        return notes;
    }

    async findTraTuDien(word) {
        let notes = [];
        let url = `https://tratu.soha.vn/dict/en_vn/${encodeURIComponent(word)}`;
        
        try {
            let data = await api.fetch(url);
            let doc = new DOMParser().parseFromString(data, 'text/html');
            
            // Xử lý phần chính
            let expression = doc.querySelector('#firstHeading')?.innerText.trim();
            let definitions = [];
            
            let sections = doc.querySelectorAll('.mw-parser-output > .section');
            sections.forEach(section => {
                let html = section.innerHTML;
                // Lọc các phần không cần thiết
                html = html.replace(/<a[^>]*>/g, '').replace(/<\/a>/g, '');
                definitions.push(html);
            });

            let css = `
                <style>
                    .section {
                        margin: 10px 0;
                        border-left: 3px solid #2196F3;
                        padding-left: 10px;
                    }
                    .mw-headline {
                        color: #2196F3;
                        font-weight: bold;
                    }
                </style>`;

            if (expression) {
                notes.push({
                    css,
                    expression,
                    reading: '',
                    definitions,
                    audios: []
                });
            }
        } catch (err) {
            console.error(err);
        }
        return notes;
    }

    renderCSS() {
        return `
            <style>
                .pos { 
                    text-transform: capitalize;
                    color: #d32f2f;
                }
                ul {
                    list-style-type: square;
                    padding-left: 20px;
                }
            </style>`;
    }
}