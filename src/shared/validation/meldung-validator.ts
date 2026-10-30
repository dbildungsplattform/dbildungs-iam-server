export class MeldungValidator {
    public static isMeldungValid(inhalt: string): boolean {
        // Extrahiere reinen Text aus HTML
        const textOnly: string = inhalt.replace(/<[^>]*>/g, '');
        return textOnly.length > 0 && textOnly.length <= 2000;
    }
}
