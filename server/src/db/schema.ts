import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  jsonb,
  date,
  decimal,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================
// Lookup tables
// ============================================================

export const platforms = pgTable(
  "platforms",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
  },
  (table) => ({
    slugIdx: uniqueIndex("platforms_slug_idx").on(table.slug),
  }),
);

export const providers = pgTable(
  "providers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
  },
  (table) => ({
    slugIdx: uniqueIndex("providers_slug_idx").on(table.slug),
  }),
);

export const genres = pgTable(
  "genres",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
  },
  (table) => ({
    slugIdx: uniqueIndex("genres_slug_idx").on(table.slug),
  }),
);

export const editionTypes = pgTable(
  "edition_types",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
  },
  (table) => ({
    slugIdx: uniqueIndex("edition_types_slug_idx").on(table.slug),
  }),
);

export const mediaFormats = pgTable(
  "media_formats",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
  },
  (table) => ({
    slugIdx: uniqueIndex("media_formats_slug_idx").on(table.slug),
  }),
);

// ============================================================
// Series
// ============================================================

export const series = pgTable(
  "series",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("series_slug_idx").on(table.slug),
  }),
);

// ============================================================
// Master Games
// ============================================================

export const masterGames = pgTable(
  "master_games",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    firstReleaseYear: smallint("first_release_year").notNull(),
    description: text("description"),
    coverImageUrl: varchar("cover_image_url", { length: 500 }),
    seriesId: integer("series_id").references(() => series.id, { onDelete: "set null" }),
    alternativeTitles: jsonb("alternative_titles").default([]).notNull(),
    igdbId: integer("igdb_id"),
    opencriticId: integer("opencritic_id"),
    hltbId: integer("hltb_id"),
    hltbTime: smallint("hltb_time"),
    criticScore: smallint("critic_score"),
    summary: text("summary"),
    screenshots: jsonb("screenshots").default([]).notNull(),
    gameModes: jsonb("game_modes").default([]).notNull(),
    playerPerspectives: jsonb("player_perspectives").default([]).notNull(),
    ageRating: varchar("age_rating", { length: 20 }),
    trailerUrl: varchar("trailer_url", { length: 500 }),
    franchise: varchar("franchise", { length: 255 }),
    developer: varchar("developer", { length: 255 }),
    publisher: varchar("publisher", { length: 255 }),
    currentLow: decimal("current_low", { precision: 10, scale: 2 }),
    historicalLow: decimal("historical_low", { precision: 10, scale: 2 }),
    priceCurrency: varchar("price_currency", { length: 3 }),
    steamAppId: integer("steam_app_id"),
    steamPlayers: integer("steam_players"),
    steamPlayersAt: timestamp("steam_players_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("master_games_slug_idx").on(table.slug),
  }),
);

// ============================================================
// Master Game - Genre junction
// ============================================================

export const masterGameGenres = pgTable(
  "master_game_genres",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => masterGames.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.gameId, table.genreId] }),
  }),
);

// ============================================================
// Release Groups
// ============================================================

export const releaseGroups = pgTable("release_groups", {
  id: serial("id").primaryKey(),
  masterGameId: integer("master_game_id")
    .notNull()
    .references(() => masterGames.id, { onDelete: "cascade" }),
  editionTypeId: integer("edition_type_id")
    .notNull()
    .references(() => editionTypes.id),
  editionName: varchar("edition_name", { length: 255 }),
  releaseYear: smallint("release_year"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// Releases
// ============================================================

export const releases = pgTable("releases", {
  id: serial("id").primaryKey(),
  releaseGroupId: integer("release_group_id")
    .notNull()
    .references(() => releaseGroups.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providers.id),
  mediaFormatId: integer("media_format_id")
    .notNull()
    .references(() => mediaFormats.id),
  intendedFor: jsonb("intended_for").default([]).notNull(),
  playableOn: jsonb("playable_on").default([]).notNull(),
  barcode: varchar("barcode", { length: 50 }),
  catalogNumber: varchar("catalog_number", { length: 100 }),
  publisher: varchar("publisher", { length: 255 }),
  region: varchar("region", { length: 50 }),
  releaseDate: date("release_date"),
  controllerSupport: varchar("controller_support", { length: 20 }).default("unknown").notNull(),
  localMultiplayer: varchar("local_multiplayer", { length: 20 }).default("unknown").notNull(),
  onlineMultiplayer: varchar("online_multiplayer", { length: 20 }).default("unknown").notNull(),
  versionImageUrl: varchar("version_image_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// DLCs
// ============================================================

export const dlcs = pgTable("dlcs", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  firstReleaseYear: smallint("first_release_year"),
  dlcType: varchar("dlc_type", { length: 50 }).notNull(),
  masterGameId: integer("master_game_id")
    .notNull()
    .references(() => masterGames.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// DLC Releases
// ============================================================

export const dlcReleases = pgTable("dlc_releases", {
  id: serial("id").primaryKey(),
  dlcId: integer("dlc_id")
    .notNull()
    .references(() => dlcs.id, { onDelete: "cascade" }),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providers.id),
  mediaFormatId: integer("media_format_id")
    .notNull()
    .references(() => mediaFormats.id),
  releaseDate: date("release_date"),
  onDiscForConsoleOnly: boolean("on_disc_for_console_only").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// DLC Release - Game Release compatibility junction
// ============================================================

export const dlcReleaseCompatibility = pgTable(
  "dlc_release_compatibility",
  {
    dlcReleaseId: integer("dlc_release_id")
      .notNull()
      .references(() => dlcReleases.id, { onDelete: "cascade" }),
    releaseId: integer("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.dlcReleaseId, table.releaseId] }),
  }),
);

// ============================================================
// Collections
// ============================================================

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  mediaFormatId: integer("media_format_id").references(() => mediaFormats.id),
  releaseYear: smallint("release_year"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// Collection - Release junction
// ============================================================

export const collectionReleases = pgTable(
  "collection_releases",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    releaseId: integer("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.releaseId] }),
  }),
);

// ============================================================
// Collection - DLC Release junction
// ============================================================

export const collectionDlcReleases = pgTable(
  "collection_dlc_releases",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    dlcReleaseId: integer("dlc_release_id")
      .notNull()
      .references(() => dlcReleases.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.dlcReleaseId] }),
  }),
);

// ============================================================
// Users & Auth
// ============================================================

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// User Data
// ============================================================

export const userFavorites = pgTable(
  "user_favorites",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    masterGameId: integer("master_game_id")
      .notNull()
      .references(() => masterGames.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.masterGameId] }),
  }),
);

export const ownedInstances = pgTable("owned_instances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  releaseId: integer("release_id").references(() => releases.id, { onDelete: "set null" }),
  dlcReleaseId: integer("dlc_release_id").references(() => dlcReleases.id, { onDelete: "set null" }),
  condition: varchar("condition", { length: 100 }),
  location: varchar("location", { length: 255 }),
  notes: text("notes"),
  acquiredDate: date("acquired_date"),
  purchasePrice: decimal("purchase_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userGamePhotos = pgTable("user_game_photos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ownedInstanceId: integer("owned_instance_id")
    .notNull()
    .references(() => ownedInstances.id, { onDelete: "cascade" }),
  imagePath: varchar("image_path", { length: 500 }).notNull(),
  scanModelPath: varchar("scan_model_path", { length: 500 }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// ============================================================
// Relations
// ============================================================

import { relations } from "drizzle-orm";

export const seriesRelations = relations(series, ({ many }) => ({
  masterGames: many(masterGames),
}));

export const masterGamesRelations = relations(masterGames, ({ one, many }) => ({
  series: one(series, {
    fields: [masterGames.seriesId],
    references: [series.id],
  }),
  genres: many(masterGameGenres),
  releaseGroups: many(releaseGroups),
  dlcs: many(dlcs),
}));

export const masterGameGenresRelations = relations(masterGameGenres, ({ one }) => ({
  game: one(masterGames, {
    fields: [masterGameGenres.gameId],
    references: [masterGames.id],
  }),
  genre: one(genres, {
    fields: [masterGameGenres.genreId],
    references: [genres.id],
  }),
}));

export const releaseGroupsRelations = relations(releaseGroups, ({ one, many }) => ({
  masterGame: one(masterGames, {
    fields: [releaseGroups.masterGameId],
    references: [masterGames.id],
  }),
  editionType: one(editionTypes, {
    fields: [releaseGroups.editionTypeId],
    references: [editionTypes.id],
  }),
  releases: many(releases),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  releaseGroup: one(releaseGroups, {
    fields: [releases.releaseGroupId],
    references: [releaseGroups.id],
  }),
  provider: one(providers, {
    fields: [releases.providerId],
    references: [providers.id],
  }),
  mediaFormat: one(mediaFormats, {
    fields: [releases.mediaFormatId],
    references: [mediaFormats.id],
  }),
  ownedInstances: many(ownedInstances),
}));

export const dlcsRelations = relations(dlcs, ({ one, many }) => ({
  masterGame: one(masterGames, {
    fields: [dlcs.masterGameId],
    references: [masterGames.id],
  }),
  dlcReleases: many(dlcReleases),
}));

export const dlcReleasesRelations = relations(dlcReleases, ({ one, many }) => ({
  dlc: one(dlcs, {
    fields: [dlcReleases.dlcId],
    references: [dlcs.id],
  }),
  provider: one(providers, {
    fields: [dlcReleases.providerId],
    references: [providers.id],
  }),
  mediaFormat: one(mediaFormats, {
    fields: [dlcReleases.mediaFormatId],
    references: [mediaFormats.id],
  }),
  compatibility: many(dlcReleaseCompatibility),
  collectionEntries: many(collectionDlcReleases),
}));

export const dlcReleaseCompatibilityRelations = relations(dlcReleaseCompatibility, ({ one }) => ({
  dlcRelease: one(dlcReleases, {
    fields: [dlcReleaseCompatibility.dlcReleaseId],
    references: [dlcReleases.id],
  }),
  release: one(releases, {
    fields: [dlcReleaseCompatibility.releaseId],
    references: [releases.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  mediaFormat: one(mediaFormats, {
    fields: [collections.mediaFormatId],
    references: [mediaFormats.id],
  }),
  releases: many(collectionReleases),
  dlcReleases: many(collectionDlcReleases),
}));

export const collectionReleasesRelations = relations(collectionReleases, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionReleases.collectionId],
    references: [collections.id],
  }),
  release: one(releases, {
    fields: [collectionReleases.releaseId],
    references: [releases.id],
  }),
}));

export const collectionDlcReleasesRelations = relations(collectionDlcReleases, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionDlcReleases.collectionId],
    references: [collections.id],
  }),
  dlcRelease: one(dlcReleases, {
    fields: [collectionDlcReleases.dlcReleaseId],
    references: [dlcReleases.id],
  }),
}));

export const ownedInstancesRelations = relations(ownedInstances, ({ one }) => ({
  release: one(releases, {
    fields: [ownedInstances.releaseId],
    references: [releases.id],
  }),
  dlcRelease: one(dlcReleases, {
    fields: [ownedInstances.dlcReleaseId],
    references: [dlcReleases.id],
  }),
}));

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userFavorites.userId],
    references: [users.id],
  }),
  game: one(masterGames, {
    fields: [userFavorites.masterGameId],
    references: [masterGames.id],
  }),
}));
