import { ItslearningNichtNachtraeglichZuweisbarError } from './itslearning-nicht-nachtraeglich-zuweisbar.error.js';

describe('ItslearningNichtNachtraeglichZuweisbarError', () => {
    it('should create an error with the correct message', () => {
        const error: ItslearningNichtNachtraeglichZuweisbarError = new ItslearningNichtNachtraeglichZuweisbarError();
        expect(error.message).toBe(
            'The itslearning ServiceProvider cannot be added to or removed from a Rolle that is already assigned to persons.',
        );
    });

    it('should allow additional details', () => {
        const details: Record<string, undefined> = { key: undefined };
        const error: ItslearningNichtNachtraeglichZuweisbarError = new ItslearningNichtNachtraeglichZuweisbarError(
            details,
        );
        expect(error.details).toEqual(details);
    });
});
