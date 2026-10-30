import DOMPurify from 'isomorphic-dompurify';
import { type DomainError, MismatchedRevisionError } from '../../../shared/error/index.js';
import { MeldungValidator } from '../../../shared/validation/meldung-validator.js';
import { type MeldungStatus } from '../persistence/meldung.entity.js';
import { MeldungInhaltError } from './meldung-inhalt.error.js';

export class Meldung<WasPersisted extends boolean> {
    private constructor(
        public id: Persisted<string, WasPersisted>,
        public createdAt: Persisted<Date, WasPersisted>,
        public updatedAt: Persisted<Date, WasPersisted>,
        public inhalt: string,
        public status: MeldungStatus,
        public revision: number,
    ) {
        this.inhalt = Meldung.sanitizeInhalt(inhalt);
    }

    public static construct<WasPersisted extends boolean = false>(
        id: string,
        createdAt: Date,
        updatedAt: Date,
        inhalt: string,
        status: MeldungStatus,
        revision: number,
    ): Meldung<WasPersisted> {
        return new Meldung(id, createdAt, updatedAt, inhalt, status, revision);
    }

    public static createNew(inhalt: string, status: MeldungStatus): Result<Meldung<false>, DomainError> {
        if (!MeldungValidator.isMeldungValid(inhalt)) {
            return { ok: false, error: new MeldungInhaltError() };
        }
        return {
            ok: true,
            value: new Meldung(undefined, undefined, undefined, inhalt, status, 1),
        };
    }

    public update(revision: number, inhalt: string, status: MeldungStatus): Result<void, DomainError> {
        if (this.revision !== revision) {
            return {
                ok: false,
                error: new MismatchedRevisionError(
                    `Revision ${revision} does not match revision ${this.revision} of stored Meldung.`,
                ),
            };
        }
        if (!MeldungValidator.isMeldungValid(inhalt)) {
            return { ok: false, error: new MeldungInhaltError() };
        }
        this.inhalt = Meldung.sanitizeInhalt(inhalt);
        this.status = status;
        this.revision = this.revision + 1;
        return { ok: true, value: undefined };
    }

    private static sanitizeInhalt(inhalt: string): string {
        DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
            if ('target' in node) {
                const href: string | null = node.getAttribute('href');
                node.removeAttribute('href');
                node.removeAttribute('target');
                node.removeAttribute('rel');

                node.setAttribute('target', '_blank');
                node.setAttribute('rel', 'noopener noreferrer nofollow');
                if (href) {
                    node.setAttribute('href', href);
                }
            }
            if (!node.hasAttribute('target') && (node.hasAttribute('xlink:href') || node.hasAttribute('href'))) {
                node.setAttribute('xlink:show', 'new');
            }
        });

        return DOMPurify.sanitize(inhalt);
    }
}
