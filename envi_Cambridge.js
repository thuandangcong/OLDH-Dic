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