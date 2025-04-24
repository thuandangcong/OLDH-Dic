/* global api */
class envi_Cambridge {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        return 'Cambridge Anh-Việt';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        let results = await Promise.all([this.findCambridge(word), this.findYoudao(word)]);
        return [].concat(...results).filter(x => x);
    }

    async findCambridge(word) {
        let notes = [];
        if (!word) return notes;

        const T = (node) => node?.innerText.trim() || '';
        const url = `https://dictionary.cambridge.org/search/english-vietnamese/direct/?q=${encodeURIComponent(word)}`;

        try {
            const doc = parser.parseFromString(await api.fetch(url), 'text/html');
            const entries = doc.querySelectorAll('.entry-body__el');

            for (const entry of entries) {
                let definitions = [];
                const expression = T(entry.querySelector('.headword'));
                const pos = T(entry.querySelector('.posgram')) || '';
                const audioUK = entry.querySelector('.uk source')?.src;
                const audioUS = entry.querySelector('.us source')?.src;

                entry.querySelectorAll('.def-block').forEach(defBlock => {
                    const eng = T(defBlock.querySelector('.def'));
                    const vie = T(defBlock.querySelector('.trans'));
                    if (!eng) return;

                    let definition = `<div class="tran-box"><span class="eng">${eng}</span><span class="vie">${vie}</span></div>`;
                    
                    const examples = Array.from(defBlock.querySelectorAll('.examp')).slice(0, this.maxexample);
                    if (examples.length) {
                        definition += '<ul class="examples">';
                        examples.forEach(ex => {
                            definition += `<li>${T(ex.querySelector('.eg'))}<br>${T(ex.querySelector('.trans'))}</li>`;
                        });
                        definition += '</ul>';
                    }
                    
                    definitions.push(definition);
                });

                notes.push({
                    css: this.renderCSS(),
                    expression,
                    reading: this.getPronunciation(entry),
                    definitions,
                    audios: [audioUK, audioUS].filter(Boolean)
                });
            }
        } catch (error) {
            console.error('Cambridge error:', error);
        }
        return notes;
    }

    getPronunciation(entry) {
        const ipas = entry.querySelectorAll('.ipa');
        return ipas.length ? `UK: ${ipas[0]?.innerText} | US: ${ipas[1]?.innerText}` : '';
    }

    async findYoudao(word) {
        if (!word) return [];

        let base = 'https://dict.youdao.com/w/';
        let url = base + encodeURIComponent(word);
        let doc = '';
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
            let youdao = getYoudao(doc); //Combine Youdao Concise English-Chinese Dictionary to the end.
            let ydtrans = getYDTrans(doc); //Combine Youdao Translation (if any) to the end.
            return [].concat(youdao, ydtrans);
        } catch (err) {
            return [];
        }

        function getYoudao(doc) {
            let notes = [];

            //get Youdao EC data: check data availability
            let defNodes = doc.querySelectorAll('#phrsListTab .trans-container ul li');
            if (!defNodes || !defNodes.length) return notes;

            //get headword and phonetic
            let expression = T(doc.querySelector('#phrsListTab .wordbook-js .keyword')); //headword
            let reading = '';
            let readings = doc.querySelectorAll('#phrsListTab .wordbook-js .pronounce');
            if (readings) {
                let reading_uk = T(readings[0]);
                let reading_us = T(readings[1]);
                reading = (reading_uk || reading_us) ? `${reading_uk} ${reading_us}` : '';
            }

            let audios = [];
            audios[0] = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`;
            audios[1] = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`;

            let definition = '<ul class="ec">';
            for (const defNode of defNodes){
                let pos = '';
                let def = T(defNode);
                let match = /(^.+?\.)\s/gi.exec(def);
                if (match && match.length > 1){
                    pos = match[1];
                    def = def.replace(pos, '');
                }
                pos = pos ? `<span class="pos simple">${pos}</span>`:'';
                definition += `<li class="ec">${pos}<span class="ec_chn">${def}</span></li>`;
            }
            definition += '</ul>';
            let css = `
                <style>
                    span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                    span.simple {background-color: #999!important}
                    ul.ec, li.ec {margin:0; padding:0;}
                </style>`;
            notes.push({
                css,
                expression,
                reading,
                definitions: [definition],
                audios
            });
            return notes;
        }

        function getYDTrans(doc) {
            let notes = [];

            //get Youdao EC data: check data availability
            let transNode = doc.querySelectorAll('#ydTrans .trans-container p')[1];
            if (!transNode) return notes;

            let definition = `${T(transNode)}`;
            let css = `
                <style>
                    .odh-expression {
                        font-size: 1em!important;
                        font-weight: normal!important;
                    }
                </style>`;
            notes.push({
                css,
                definitions: [definition],
            });
            return notes;
        }

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }
    }

    renderCSS() {
        return `
            <style>
                .vie {color: #2e7d32; font-weight: 500;}
                .examples {color: #666; margin-top: 8px;}
                .pos-tag {background: #1565c0; color: white;}
                audio {width: 100%; margin-top: 8px;}
            </style>`;
    }
}