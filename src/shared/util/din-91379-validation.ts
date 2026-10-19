import { applyDecorators } from '@nestjs/common';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, Matches, type ValidationOptions } from 'class-validator';

// Regex to validate DIN-91379A for a string
// Generated using the list of legal characters using these steps:
// 1. All single-sequence characters are combined as best as possible.
// 2. All two-sequence characters are grouped by their first codepoint
// 3. All three-sequence characters are kept as is and appended at the end

/**
 * Namen natürlicher Personen
 */
export const DIN_91379A: RegExp =
    /^(\u0020|\u0027|[\u002C-\u002E]|[\u0041-\u005A]|[\u0060-\u007A]|\u007E|\u00A8|\u00B4|\u00B7|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u017E]|[\u0187-\u0188]|\u018F|\u0197|[\u01A0-\u01A1]|[\u01AF-\u01B0]|\u01B7|[\u01CD-\u01DC]|[\u01DE-\u01DF]|[\u01E2-\u01F0]|[\u01F4-\u01F5]|[\u01F8-\u01FF]|[\u0212-\u0213]|[\u0218-\u021B]|[\u021E-\u021F]|[\u0227-\u0233]|\u0259|\u0268|\u0292|[\u02B9-\u02BA]|[\u02BE-\u02BF]|\u02C8|\u02CC|[\u1E02-\u1E03]|[\u1E06-\u1E07]|[\u1E0A-\u1E11]|\u1E17|[\u1E1C-\u1E2B]|[\u1E2F-\u1E37]|[\u1E3A-\u1E3B]|[\u1E40-\u1E49]|[\u1E52-\u1E5B]|[\u1E5E-\u1E63]|[\u1E6A-\u1E6F]|[\u1E80-\u1E87]|[\u1E8C-\u1E97]|\u1E9E|[\u1EA0-\u1EF9]|\u2019|\u2021|\u0041\u030B|\u0043[\u0300\u0304\u0306\u0308\u0315\u0323\u0326]|\u0044\u0302|\u0046[\u0300\u0304]|\u0047\u0300|\u0048[\u0304\u0326\u0331]|\u004A[\u0301\u030C]|\u004B[\u0300\u0302\u0304\u0307\u0315\u031B\u0326]|\u004C[\u0302\u0325\u0326]|\u004D[\u0300\u0302\u0306\u0310]|\u004E[\u0302\u0304\u0306\u0326]|\u0050[\u0300\u0304\u0315\u0323]|\u0052[\u0306\u0325]|\u0053[\u0300\u0304\u0331]|\u0054[\u0300\u0304\u0308\u0315\u031B]|\u0055\u0307|\u005A[\u0300\u0304\u0306\u0308\u0327]|\u0061\u030B|\u0063[\u0300\u0304\u0306\u0308\u0315\u0323\u0326]|\u0064\u0302|\u0066[\u0300\u0304]|\u0067\u0300|\u0068[\u0304\u0326]|\u006A\u0301|\u006B[\u0300\u0302\u0304\u0307\u0315\u031B\u0326]|\u006C[\u0302\u0325\u0326]|\u006D[\u0300\u0302\u0306\u0310]|\u006E[\u0302\u0304\u0306\u0326]|\u0070[\u0300\u0304\u0315\u0323]|\u0072[\u0306\u0325]|\u0073[\u0300\u0304\u0331]|\u0074[\u0300\u0304\u0315\u031B]|\u0075\u0307|\u007A[\u0300\u0304\u0306\u0308\u0327]|\u00C7\u0306|\u00DB\u0304|\u00E7\u0306|\u00FB\u0304|\u00FF\u0301|\u010C[\u0315\u0323]|\u010D[\u0315\u0323]|\u0113\u030D|\u012A\u0301|\u012B\u0301|\u014D\u030D|\u017D[\u0326\u0327]|\u017E[\u0326\u0327]|\u1E32\u0304|\u1E33\u0304|\u1E62\u0304|\u1E63\u0304|\u1E6C\u0304|\u1E6D\u0304|\u1EA0\u0308|\u1EA1\u0308|\u1ECC\u0308|\u1ECD\u0308|\u1EE4[\u0304\u0308]|\u0043\u0328\u0306|\u004B\u035F\u0048|\u004B\u035F\u0068|\u004C\u0325\u0304|\u0052\u0325\u0304|\u0053\u031B\u0304|\u0063\u0328\u0306|\u006B\u035F\u0068|\u006C\u0325\u0304|\u0072\u0325\u0304|\u0073\u031B\u0304)*$/;

/**
 * Namen natürlicher Personen + '()' & '0-9'
 */
export const DIN_91379A_EXT: RegExp =
    /^(\u0020|[\u0027-\u0029]|\d|[\u002C-\u002E]|[\u0041-\u005A]|[\u0060-\u007A]|\u007E|\u00A8|\u00B4|\u00B7|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u017E]|[\u0187-\u0188]|\u018F|\u0197|[\u01A0-\u01A1]|[\u01AF-\u01B0]|\u01B7|[\u01CD-\u01DC]|[\u01DE-\u01DF]|[\u01E2-\u01F0]|[\u01F4-\u01F5]|[\u01F8-\u01FF]|[\u0212-\u0213]|[\u0218-\u021B]|[\u021E-\u021F]|[\u0227-\u0233]|\u0259|\u0268|\u0292|[\u02B9-\u02BA]|[\u02BE-\u02BF]|\u02C8|\u02CC|[\u1E02-\u1E03]|[\u1E06-\u1E07]|[\u1E0A-\u1E11]|\u1E17|[\u1E1C-\u1E2B]|[\u1E2F-\u1E37]|[\u1E3A-\u1E3B]|[\u1E40-\u1E49]|[\u1E52-\u1E5B]|[\u1E5E-\u1E63]|[\u1E6A-\u1E6F]|[\u1E80-\u1E87]|[\u1E8C-\u1E97]|\u1E9E|[\u1EA0-\u1EF9]|\u2019|\u2021|\u0041\u030B|\u0043[\u0300\u0304\u0306\u0308\u0315\u0323\u0326]|\u0044\u0302|\u0046[\u0300\u0304]|\u0047\u0300|\u0048[\u0304\u0326\u0331]|\u004A[\u0301\u030C]|\u004B[\u0300\u0302\u0304\u0307\u0315\u031B\u0326]|\u004C[\u0302\u0325\u0326]|\u004D[\u0300\u0302\u0306\u0310]|\u004E[\u0302\u0304\u0306\u0326]|\u0050[\u0300\u0304\u0315\u0323]|\u0052[\u0306\u0325]|\u0053[\u0300\u0304\u0331]|\u0054[\u0300\u0304\u0308\u0315\u031B]|\u0055\u0307|\u005A[\u0300\u0304\u0306\u0308\u0327]|\u0061\u030B|\u0063[\u0300\u0304\u0306\u0308\u0315\u0323\u0326]|\u0064\u0302|\u0066[\u0300\u0304]|\u0067\u0300|\u0068[\u0304\u0326]|\u006A\u0301|\u006B[\u0300\u0302\u0304\u0307\u0315\u031B\u0326]|\u006C[\u0302\u0325\u0326]|\u006D[\u0300\u0302\u0306\u0310]|\u006E[\u0302\u0304\u0306\u0326]|\u0070[\u0300\u0304\u0315\u0323]|\u0072[\u0306\u0325]|\u0073[\u0300\u0304\u0331]|\u0074[\u0300\u0304\u0315\u031B]|\u0075\u0307|\u007A[\u0300\u0304\u0306\u0308\u0327]|\u00C7\u0306|\u00DB\u0304|\u00E7\u0306|\u00FB\u0304|\u00FF\u0301|\u010C[\u0315\u0323]|\u010D[\u0315\u0323]|\u0113\u030D|\u012A\u0301|\u012B\u0301|\u014D\u030D|\u017D[\u0326\u0327]|\u017E[\u0326\u0327]|\u1E32\u0304|\u1E33\u0304|\u1E62\u0304|\u1E63\u0304|\u1E6C\u0304|\u1E6D\u0304|\u1EA0\u0308|\u1EA1\u0308|\u1ECC\u0308|\u1ECD\u0308|\u1EE4[\u0304\u0308]|\u0043\u0328\u0306|\u004B\u035F\u0048|\u004B\u035F\u0068|\u004C\u0325\u0304|\u0052\u0325\u0304|\u0053\u031B\u0304|\u0063\u0328\u0306|\u006B\u035F\u0068|\u006C\u0325\u0304|\u0072\u0325\u0304|\u0073\u031B\u0304)*$/;

// Mappings of characters to their base character (Searchform) according to DIN-91379
const NORMATIVE_MAPPINGS: { pattern: RegExp; base: string }[] = [
    // [A,A̋,a,a̋,À,Á,Â,Ã,à,á,â,ã,Ā,ā,Ă,ă,Ą,ą,Ǎ,ǎ,ȧ,Ạ,ạ,Ả,ả,Ấ,ấ,Ầ,ầ,Ẩ,ẩ,Ẫ,ẫ,Ậ,ậ,Ắ,ắ,Ằ,ằ,Ẳ,ẳ,Ẵ,ẵ,Ặ,ặ] -> A
    {
        base: 'A',
        pattern:
            /(\u0041|\u0041\u030B|\u0061|\u0061\u030B|\u00C0|\u00C1|\u00C2|\u00C3|\u00E0|\u00E1|\u00E2|\u00E3|\u0100|\u0101|\u0102|\u0103|\u0104|\u0105|\u01CD|\u01CE|\u0227|\u1EA0|\u1EA1|\u1EA2|\u1EA3|\u1EA4|\u1EA5|\u1EA6|\u1EA7|\u1EA8|\u1EA9|\u1EAA|\u1EAB|\u1EAC|\u1EAD|\u1EAE|\u1EAF|\u1EB0|\u1EB1|\u1EB2|\u1EB3|\u1EB4|\u1EB5|\u1EB6|\u1EB7)/g,
    },
    // [B,b,Ḃ,ḃ,Ḇ,ḇ] -> B
    { base: 'B', pattern: /[\u0042\u0062\u1E02\u1E03\u1E06\u1E07]/g },
    // [C,C̀,C̄,C̆,C̈,C̕,C̣,C̦,C̨̆,c,c̀,c̄,c̆,c̈,c̕,c̣,c̦,c̨̆,Ç,Ç̆,ç,ç̆,Ć,ć,Ĉ,ĉ,Ċ,ċ,Č,Č̕,Č̣,č,č̕,č̣,Ƈ,ƈ] -> C
    {
        base: 'C',
        pattern:
            /(\u0043|\u0043\u0300|\u0043\u0304|\u0043\u0306|\u0043\u0308|\u0043\u0315|\u0043\u0323|\u0043\u0326|\u0043\u0328\u0306|\u0063|\u0063\u0300|\u0063\u0304|\u0063\u0306|\u0063\u0308|\u0063\u0315|\u0063\u0323|\u0063\u0326|\u0063\u0328\u0306|\u00C7|\u00C7\u0306|\u00E7|\u00E7\u0306|\u0106|\u0107|\u0108|\u0109|\u010A|\u010B|\u010C|\u010C\u0315|\u010C\u0323|\u010D|\u010D\u0315|\u010D\u0323|\u0187|\u0188)/g,
    },
    // [D,D̂,d,d̂,Ð,ð,Ď,ď,Đ,đ,Ḋ,ḋ,Ḍ,ḍ,Ḏ,ḏ,Ḑ,ḑ] -> D
    {
        base: 'D',
        pattern:
            /(\u0044|\u0044\u0302|\u0064|\u0064\u0302|\u00D0|\u00F0|\u010E|\u010F|\u0110|\u0111|\u1E0A|\u1E0B|\u1E0C|\u1E0D|\u1E0E|\u1E0F|\u1E10|\u1E11)/g,
    },
    // [E,e,È,É,Ê,Ë,è,é,ê,ë,Ē,ē,ē̍,Ĕ,ĕ,Ė,ė,Ę,ę,Ě,ě,Ə,Ȩ,ȩ,ə,ḗ,Ḝ,ḝ,Ẹ,ẹ,Ẻ,ẻ,Ẽ,ẽ,Ế,ế,Ề,ề,Ể,ể,Ễ,ễ,Ệ,ệ] -> E
    {
        base: 'E',
        pattern:
            /(\u0045|\u0065|\u00C8|\u00C9|\u00CA|\u00CB|\u00E8|\u00E9|\u00EA|\u00EB|\u0112|\u0113|\u0113\u030D|\u0114|\u0115|\u0116|\u0117|\u0118|\u0119|\u011A|\u011B|\u018F|\u0228|\u0229|\u0259|\u1E17|\u1E1C|\u1E1D|\u1EB8|\u1EB9|\u1EBA|\u1EBB|\u1EBC|\u1EBD|\u1EBE|\u1EBF|\u1EC0|\u1EC1|\u1EC2|\u1EC3|\u1EC4|\u1EC5|\u1EC6|\u1EC7)/g,
    },
    // [F,F̀,F̄,f,f̀,f̄,Ḟ,ḟ] -> F
    { base: 'F', pattern: /(\u0046|\u0046\u0300|\u0046\u0304|\u0066|\u0066\u0300|\u0066\u0304|\u1E1E|\u1E1F)/g },
    // [G,G̀,g,g̀,Ĝ,ĝ,Ğ,ğ,Ġ,ġ,Ģ,ģ,Ǥ,ǥ,Ǧ,ǧ,Ǵ,ǵ,Ḡ,ḡ] -> G
    {
        base: 'G',
        pattern:
            /(\u0047|\u0047\u0300|\u0067|\u0067\u0300|\u011C|\u011D|\u011E|\u011F|\u0120|\u0121|\u0122|\u0123|\u01E4|\u01E5|\u01E6|\u01E7|\u01F4|\u01F5|\u1E20|\u1E21)/g,
    },
    // [H,H̄,H̦,H̱,h,h̄,h̦,Ĥ,ĥ,Ħ,ħ,Ȟ,ȟ,Ḣ,ḣ,Ḥ,ḥ,Ḧ,ḧ,Ḩ,ḩ,Ḫ,ḫ,ẖ] -> H
    {
        base: 'H',
        pattern:
            /(\u0048|\u0048\u0304|\u0048\u0326|\u0048\u0331|\u0068|\u0068\u0304|\u0068\u0326|\u0124|\u0125|\u0126|\u0127|\u021E|\u021F|\u1E22|\u1E23|\u1E24|\u1E25|\u1E26|\u1E27|\u1E28|\u1E29|\u1E2A|\u1E2B|\u1E96)/g,
    },
    // [I,i,Ì,Í,Î,Ï,ì,í,î,ï,Ĩ,ĩ,Ī,Ī́,ī,ī́,Ĭ,ĭ,Į,į,İ,ı,Ɨ,Ǐ,ǐ,ɨ,ḯ,Ỉ,ỉ,Ị,ị] -> I
    {
        base: 'I',
        pattern:
            /(\u0049|\u0069|\u00CC|\u00CD|\u00CE|\u00CF|\u00EC|\u00ED|\u00EE|\u00EF|\u0128|\u0129|\u012A|\u012A\u0301|\u012B|\u012B\u0301|\u012C|\u012D|\u012E|\u012F|\u0130|\u0131|\u0197|\u01CF|\u01D0|\u0268|\u1E2F|\u1EC8|\u1EC9|\u1ECA|\u1ECB)/g,
    },
    // [J,J́,J̌,j,j́,Ĵ,ĵ,ǰ] -> J
    { base: 'J', pattern: /(\u004A|\u004A\u0301|\u004A\u030C|\u006A|\u006A\u0301|\u0134|\u0135|\u01F0)/g },
    // [K,K̀,K̂,K̄,K̇,K̕,K̛,K̦,k,k̀,k̂,k̄,k̇,k̕,k̛,k̦,Ķ,ķ,ĸ,Ǩ,ǩ,Ḱ,ḱ,Ḳ,Ḳ̄,ḳ,ḳ̄,Ḵ,ḵ] -> K
    {
        base: 'K',
        pattern:
            /(\u004B|\u004B\u0300|\u004B\u0302|\u004B\u0304|\u004B\u0307|\u004B\u0315|\u004B\u031B|\u004B\u0326|\u006B|\u006B\u0300|\u006B\u0302|\u006B\u0304|\u006B\u0307|\u006B\u0315|\u006B\u031B|\u006B\u0326|\u0136|\u0137|\u0138|\u01E8|\u01E9|\u1E30|\u1E31|\u1E32|\u1E32\u0304|\u1E33|\u1E33\u0304|\u1E34|\u1E35)/g,
    },
    // [K͟H,K͟h,k͟h] -> KH
    { base: 'KH', pattern: /(\u004B\u035F\u0048|\u004B\u035F\u0068|\u006B\u035F\u0068)/g },
    // [L,L̂,L̥,L̥̄,L̦,l,l̂,l̥,l̥̄,l̦,Ĺ,ĺ,Ļ,ļ,Ľ,ľ,Ŀ,ŀ,Ł,ł,Ḷ,ḷ,Ḻ,ḻ] -> L
    {
        base: 'L',
        pattern:
            /(\u004C|\u004C\u0302|\u004C\u0325|\u004C\u0325\u0304|\u004C\u0326|\u006C|\u006C\u0302|\u006C\u0325|\u006C\u0325\u0304|\u006C\u0326|\u0139|\u013A|\u013B|\u013C|\u013D|\u013E|\u013F|\u0140|\u0141|\u0142|\u1E36|\u1E37|\u1E3A|\u1E3B)/g,
    },
    // [M,M̀,M̂,M̆,M̐,m,m̀,m̂,m̆,m̐,Ṁ,ṁ,Ṃ,ṃ] -> M
    {
        base: 'M',
        pattern:
            /(\u004D|\u004D\u0300|\u004D\u0302|\u004D\u0306|\u004D\u0310|\u006D|\u006D\u0300|\u006D\u0302|\u006D\u0306|\u006D\u0310|\u1E40|\u1E41|\u1E42|\u1E43)/g,
    },
    // [N,N̂,N̄,N̆,N̦,n,n̂,n̄,n̆,n̦,Ñ,ñ,Ń,ń,Ņ,ņ,Ň,ň,ŉ,Ŋ,ŋ,Ǹ,ǹ,Ṅ,ṅ,Ṇ,ṇ,Ṉ,ṉ] -> N
    {
        base: 'N',
        pattern:
            /(\u004E|\u004E\u0302|\u004E\u0304|\u004E\u0306|\u004E\u0326|\u006E|\u006E\u0302|\u006E\u0304|\u006E\u0306|\u006E\u0326|\u00D1|\u00F1|\u0143|\u0144|\u0145|\u0146|\u0147|\u0148|\u0149|\u014A|\u014B|\u01F8|\u01F9|\u1E44|\u1E45|\u1E46|\u1E47|\u1E48|\u1E49)/g,
    },
    // [O,o,Ò,Ó,Ô,Õ,ò,ó,ô,õ,Ō,ō,ō̍,Ŏ,ŏ,Ő,ő,Ơ,ơ,Ǒ,ǒ,Ǫ,ǫ,Ǭ,ǭ,Ȭ,ȭ,Ȯ,ȯ,Ȱ,ȱ,Ṓ,ṓ,Ọ,ọ,Ỏ,ỏ,Ố,ố,Ồ,ồ,Ổ,ổ,Ỗ,ỗ,Ộ,ộ,Ớ,ớ,Ờ,ờ,Ở,ở,Ỡ,ỡ,Ợ,ợ] -> O
    {
        base: 'O',
        pattern:
            /(\u004F|\u006F|\u00D2|\u00D3|\u00D4|\u00D5|\u00F2|\u00F3|\u00F4|\u00F5|\u014C|\u014D|\u014D\u030D|\u014E|\u014F|\u0150|\u0151|\u01A0|\u01A1|\u01D1|\u01D2|\u01EA|\u01EB|\u01EC|\u01ED|\u022C|\u022D|\u022E|\u022F|\u0230|\u0231|\u1E52|\u1E53|\u1ECC|\u1ECD|\u1ECE|\u1ECF|\u1ED0|\u1ED1|\u1ED2|\u1ED3|\u1ED4|\u1ED5|\u1ED6|\u1ED7|\u1ED8|\u1ED9|\u1EDA|\u1EDB|\u1EDC|\u1EDD|\u1EDE|\u1EDF|\u1EE0|\u1EE1|\u1EE2|\u1EE3)/g,
    },
    // [P,P̀,P̄,P̕,P̣,p,p̀,p̄,p̕,p̣,Ṕ,ṕ,Ṗ,ṗ] -> P
    {
        base: 'P',
        pattern:
            /(\u0050|\u0050\u0300|\u0050\u0304|\u0050\u0315|\u0050\u0323|\u0070|\u0070\u0300|\u0070\u0304|\u0070\u0315|\u0070\u0323|\u1E54|\u1E55|\u1E56|\u1E57)/g,
    },
    // [Q,q] -> Q
    { base: 'Q', pattern: /[\u0051\u0071]/g },
    // [R,R̆,R̥,R̥̄,r,r̆,r̥,r̥̄,Ŕ,ŕ,Ŗ,ŗ,Ř,ř,Ȓ,ȓ,Ṙ,ṙ,Ṛ,ṛ,Ṟ,ṟ] -> R
    {
        base: 'R',
        pattern:
            /(\u0052|\u0052\u0306|\u0052\u0325|\u0052\u0325\u0304|\u0072|\u0072\u0306|\u0072\u0325|\u0072\u0325\u0304|\u0154|\u0155|\u0156|\u0157|\u0158|\u0159|\u0212|\u0213|\u1E58|\u1E59|\u1E5A|\u1E5B|\u1E5E|\u1E5F)/g,
    },
    // [S,S̀,S̄,S̛̄,S̱,s,s̀,s̄,s̛̄,s̱,Ś,ś,Ŝ,ŝ,Ş,ş,Š,š,Ș,ș,Ṡ,ṡ,Ṣ,Ṣ̄,ṣ,ṣ̄] -> S
    {
        base: 'S',
        pattern:
            /(\u0053|\u0053\u0300|\u0053\u0304|\u0053\u031B\u0304|\u0053\u0331|\u0073|\u0073\u0300|\u0073\u0304|\u0073\u031B\u0304|\u0073\u0331|\u015A|\u015B|\u015C|\u015D|\u015E|\u015F|\u0160|\u0161|\u0218|\u0219|\u1E60|\u1E61|\u1E62|\u1E62\u0304|\u1E63|\u1E63\u0304)/g,
    },
    // [T,T̀,T̄,T̈,T̕,T̛,t,t̀,t̄,t̕,t̛,Ţ,ţ,Ť,ť,Ŧ,ŧ,Ț,ț,Ṫ,ṫ,Ṭ,Ṭ̄,ṭ,ṭ̄,Ṯ,ṯ,ẗ] -> T
    {
        base: 'T',
        pattern:
            /(\u0054|\u0054\u0300|\u0054\u0304|\u0054\u0308|\u0054\u0315|\u0054\u031B|\u0074|\u0074\u0300|\u0074\u0304|\u0074\u0315|\u0074\u031B|\u0162|\u0163|\u0164|\u0165|\u0166|\u0167|\u021A|\u021B|\u1E6A|\u1E6B|\u1E6C|\u1E6C\u0304|\u1E6D|\u1E6D\u0304|\u1E6E|\u1E6F|\u1E97)/g,
    },
    // [U,U̇,u,u̇,Ù,Ú,Û,Û̄,ù,ú,û,û̄,Ũ,ũ,Ū,ū,Ŭ,ŭ,Ů,ů,Ű,ű,Ų,ų,Ư,ư,Ǔ,ǔ,Ụ,Ụ̄,ụ,ụ̄,Ủ,ủ,Ứ,ứ,Ừ,ừ,Ử,ử,Ữ,ữ,Ự,ự] -> U
    {
        base: 'U',
        pattern:
            /(\u0055|\u0055\u0307|\u0075|\u0075\u0307|\u00D9|\u00DA|\u00DB|\u00DB\u0304|\u00F9|\u00FA|\u00FB|\u00FB\u0304|\u0168|\u0169|\u016A|\u016B|\u016C|\u016D|\u016E|\u016F|\u0170|\u0171|\u0172|\u0173|\u01AF|\u01B0|\u01D3|\u01D4|\u1EE4|\u1EE4\u0304|\u1EE5|\u1EE5\u0304|\u1EE6|\u1EE7|\u1EE8|\u1EE9|\u1EEA|\u1EEB|\u1EEC|\u1EED|\u1EEE|\u1EEF|\u1EF0|\u1EF1)/g,
    },
    // [V,v] -> V
    { base: 'V', pattern: /[\u0056\u0076]/g },
    // [W,w,Ŵ,ŵ,Ẁ,ẁ,Ẃ,ẃ,Ẅ,ẅ,Ẇ,ẇ] -> W
    { base: 'W', pattern: /[\u0057\u0077\u0174\u0175\u1E80\u1E81\u1E82\u1E83\u1E84\u1E85\u1E86\u1E87]/g },
    // [X,x,Ẍ,ẍ] -> X
    { base: 'X', pattern: /[\u0058\u0078\u1E8C\u1E8D]/g },
    // [Y,y,Ý,ý,ÿ,ÿ́,Ŷ,ŷ,Ÿ,Ȳ,ȳ,Ẏ,ẏ,Ỳ,ỳ,Ỵ,ỵ,Ỷ,ỷ,Ỹ,ỹ] -> Y
    {
        base: 'Y',
        pattern:
            /(\u0059|\u0079|\u00DD|\u00FD|\u00FF|\u00FF\u0301|\u0176|\u0177|\u0178|\u0232|\u0233|\u1E8E|\u1E8F|\u1EF2|\u1EF3|\u1EF4|\u1EF5|\u1EF6|\u1EF7|\u1EF8|\u1EF9)/g,
    },
    // [Z,Z̀,Z̄,Z̆,Z̈,Z̧,z,z̀,z̄,z̆,z̈,z̧,Ź,ź,Ż,ż,Ž,Ž̦,Ž̧,ž,ž̦,ž̧,Ʒ,Ǯ,ǯ,ʒ,Ẑ,ẑ,Ẓ,ẓ,Ẕ,ẕ] -> Z
    {
        base: 'Z',
        pattern:
            /(\u005A|\u005A\u0300|\u005A\u0304|\u005A\u0306|\u005A\u0308|\u005A\u0327|\u007A|\u007A\u0300|\u007A\u0304|\u007A\u0306|\u007A\u0308|\u007A\u0327|\u0179|\u017A|\u017B|\u017C|\u017D|\u017D\u0326|\u017D\u0327|\u017E|\u017E\u0326|\u017E\u0327|\u01B7|\u01EE|\u01EF|\u0292|\u1E90|\u1E91|\u1E92|\u1E93|\u1E94|\u1E95)/g,
    },
    // [Ä,Æ,ä,æ,Ǟ,ǟ,Ǣ,ǣ,Ǽ,ǽ,Ạ̈,ạ̈] -> AE
    {
        base: 'AE',
        pattern: /(\u00C4|\u00C6|\u00E4|\u00E6|\u01DE|\u01DF|\u01E2|\u01E3|\u01FC|\u01FD|\u1EA0\u0308|\u1EA1\u0308)/g,
    },
    // [Å,å,Ǻ,ǻ] -> AA
    { base: 'AA', pattern: /[\u00C5\u00E5\u01FA\u01FB]/g },
    // [Ö,Ø,ö,ø,Œ,œ,Ǿ,ǿ,Ȫ,ȫ,Ọ̈,ọ̈] -> OE
    {
        base: 'OE',
        pattern: /(\u00D6|\u00D8|\u00F6|\u00F8|\u0152|\u0153|\u01FE|\u01FF|\u022A|\u022B|\u1ECC\u0308|\u1ECD\u0308)/g,
    },
    // [Ü,ü,Ǖ,ǖ,Ǘ,ǘ,Ǚ,ǚ,Ǜ,ǜ,Ụ̈,ụ̈] -> UE
    {
        base: 'UE',
        pattern: /(\u00DC|\u00FC|\u01D5|\u01D6|\u01D7|\u01D8|\u01D9|\u01DA|\u01DB|\u01DC|\u1EE4\u0308|\u1EE5\u0308)/g,
    },
    // [Þ,þ] -> TH
    { base: 'TH', pattern: /[\u00DE\u00FE]/g },
    // [ß,ẞ] -> SS
    { base: 'SS', pattern: /[\u00DF\u1E9E]/g },
    // [Ĳ,ĳ] -> IJ
    { base: 'IJ', pattern: /[\u0132\u0133]/g },
];

export function isDIN91379A(input: string): boolean {
    return DIN_91379A.test(input.normalize('NFC'));
}

/**
 * Replaces all normative characters according to the search-form replacement table in DIN-91379
 * Will not touch other characters
 */
export function toDIN91379SearchForm(input: string): string {
    let searchForm: string = input.normalize('NFC');
    for (const replacement of NORMATIVE_MAPPINGS) {
        searchForm = searchForm.replace(replacement.pattern, replacement.base);
    }

    return searchForm;
}

export function IsDIN91379A(validationOptions?: ValidationOptions): PropertyDecorator {
    return applyDecorators(
        Transform(({ value }: TransformFnParams) => (typeof value === 'string' ? value.normalize('NFC') : undefined)),
        IsString(validationOptions),
        Matches(DIN_91379A, validationOptions),
    );
}

export function IsDIN91379AEXT(validationOptions?: ValidationOptions): PropertyDecorator {
    return applyDecorators(
        Transform(({ value }: TransformFnParams) => (typeof value === 'string' ? value.normalize('NFC') : undefined)),
        IsString(validationOptions),
        Matches(DIN_91379A_EXT, validationOptions),
    );
}
