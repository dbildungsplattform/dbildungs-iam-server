import DOMPurify from 'isomorphic-dompurify';

export class MeldungValidator {
    public static isMeldungValid(inhalt: string): boolean {
        // Extrahiere reinen Text mit DOMPurify (HTML-Tags entfernen, Entities dekodieren)
        const fragment: DocumentFragment = DOMPurify.sanitize(inhalt, {
            KEEP_CONTENT: true,
            RETURN_DOM_FRAGMENT: true,
        });
        const textOnly: string = fragment.textContent ?? '';

        return textOnly.length > 0 && textOnly.length <= 2000;
    }
}
