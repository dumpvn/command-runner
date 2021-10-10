'use strict';

const regexp = /\$\{(.*?)\}/g;

async function replace(str: string, handler: (matched: string) => string | Promise<string>): Promise<string> {


    if (str) {
        let matched = regexp.exec(str);
        let result = '';
        let idx = 0;

        while (matched) {
            result += str.slice(idx, matched.index);
            result += await handler(matched[1]) || '';
            idx = matched.index + matched[0].length;
            matched = regexp.exec(str);
        }
        return result + str.slice(idx);
    }

    return str;
}

export default replace;
