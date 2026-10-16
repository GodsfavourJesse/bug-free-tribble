import {
    index,
    pgTable,
    primaryKey,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users/users.ts";

export const roles = pgTable(
    "roles",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        name: varchar("name", {
            length: 50,
        })
            .notNull()
            .unique(),

        description: varchar("description", {
            length: 255,
        }),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

        updatedAt: timestamp(
            "updated_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        nameIdx: index(
            "roles_name_idx",
        ).on(table.name),
    }),
);

export const permissions = pgTable(
    "permissions",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        key: varchar("key", {
            length: 120,
        })
            .notNull()
            .unique(),

        description: varchar("description", {
            length: 255,
        }),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

        updatedAt: timestamp(
            "updated_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        keyIdx: index(
            "permissions_key_idx",
        ).on(table.key),
    }),
);

export const rolePermissions = pgTable(
    "role_permissions",
    {
        roleId: uuid("role_id")
            .notNull()
            .references(
                () => roles.id,
                {
                    onDelete:
                        "cascade",
                },
            ),

        permissionId: uuid(
            "permission_id",
        )
            .notNull()
            .references(
                () =>
                    permissions.id,
                {
                    onDelete:
                        "cascade",
                },
            ),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        pk: primaryKey({
            columns: [
                table.roleId,
                table.permissionId,
            ],
        }),

        permissionIdx: index(
            "role_permissions_permission_idx",
        ).on(
            table.permissionId,
        ),

        roleIdx: index(
            "role_permissions_role_idx",
        ).on(
            table.roleId,
        ),
    }),
);

export const userRoles = pgTable(
    "user_roles",
    {
        userId: uuid("user_id")
            .notNull()
            .references(
                () => users.id,
                {
                    onDelete:
                        "cascade",
                },
            ),

        roleId: uuid("role_id")
            .notNull()
            .references(
                () => roles.id,
                {
                    onDelete:
                        "cascade",
                },
            ),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        pk: primaryKey({
            columns: [
                table.userId,
                table.roleId,
            ],
        }),

        userIdx: index(
            "user_roles_user_idx",
        ).on(table.userId),

        roleIdx: index(
            "user_roles_role_idx",
        ).on(table.roleId),
    }),
);