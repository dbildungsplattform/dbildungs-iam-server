import { Migration } from '@mikro-orm/migrations';

export class Migration20261012120000 extends Migration {
    override up(): void | Promise<void> {
        this.addSql(
            `create table "event_outbox" ("id" uuid not null, "event_key" varchar(255) not null, "kafka_key" varchar(255) null, "payload" text not null, "created_at" timestamptz not null, "published_at" timestamptz null, "attempts" int not null default 0, "last_error" text null, constraint "event_outbox_pkey" primary key ("id"));`,
        );

        this.addSql(`create index "event_outbox_unpublished_index" on "event_outbox" ("published_at", "created_at");`);
    }
}
