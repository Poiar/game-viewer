export interface MasterGame {
  id: number;
  title: string;
  slug: string;
  firstReleaseYear: number;
  description: string | null;
  coverImageUrl: string | null;
  seriesId: number | null;
  alternativeTitles: string[];
  igdbId?: number | null;
  opencriticId?: number | null;
  hltbId?: number | null;
  hltbTime?: number | null;
  criticScore?: number | null;
  summary?: string | null;
  screenshots?: string[];
  gameModes?: string[];
  playerPerspectives?: string[];
  ageRating?: string | null;
  trailerUrl?: string | null;
  franchise?: string | null;
  developer?: string | null;
  publisher?: string | null;
  currentLow?: string | null;
  historicalLow?: string | null;
  priceCurrency?: string | null;
  steamAppId?: number | null;
  steamPlayers?: number | null;
  createdAt: string;
  updatedAt: string;
  series?: SeriesSummary;
  genres?: GenreSummary[];
  releaseGroups?: ReleaseGroup[];
  dlcs?: Dlc[];
  _count?: { releaseGroups: number };
  ownedReleases?: { platforms: string[]; formats: string[] }[];
}

export interface MasterGameDetail extends MasterGame {
  releaseGroups: ReleaseGroupDetail[];
  dlcs: DlcDetail[];
}

export interface SeriesSummary {
  id: number;
  name: string;
  slug: string;
}

export interface GenreSummary {
  id: number;
  name: string;
  slug: string;
}

export interface Series {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  games?: MasterGame[];
  gameCount?: number;
  mainlineCount?: number;
  ownedCount?: number;
  covers?: string[];
  _count?: { games: number };
}

export interface ReleaseGroup {
  id: number;
  masterGameId: number;
  editionTypeId: number;
  editionName: string | null;
  releaseYear: number | null;
  createdAt: string;
  editionType?: EditionType;
  releases?: Release[];
}

export interface ReleaseGroupDetail extends ReleaseGroup {
  releases: ReleaseDetail[];
}

export interface EditionType {
  id: number;
  name: string;
  slug: string;
}

export interface Release {
  id: number;
  releaseGroupId: number;
  title: string | null;
  providerId: number;
  mediaFormatId: number;
  intendedFor: string[];
  playableOn: string[];
  barcode: string | null;
  catalogNumber: string | null;
  publisher: string | null;
  region: string | null;
  releaseDate: string | null;
  controllerSupport: string;
  localMultiplayer: string;
  onlineMultiplayer: string;
  versionImageUrl: string | null;
  createdAt: string;
  provider?: Provider;
  mediaFormat?: MediaFormat;
  masterGame?: { id: number; title: string; slug: string } | null;
  editionType?: EditionType | null;
  releaseGroup?: ReleaseGroup & { masterGame?: MasterGame };
  userOwns?: {
    id: number;
    condition: string | null;
    location: string | null;
    purchasePrice: string | null;
    acquiredDate: string | null;
  } | null;
}

export interface ReleaseDetail extends Release {
  provider: Provider;
  mediaFormat: MediaFormat;
  dlcCompatibility?: DlcReleaseCompatibility[];
}

export interface Provider {
  id: number;
  name: string;
  slug: string;
}

export interface MediaFormat {
  id: number;
  name: string;
  slug: string;
}

export interface Platform {
  id: number;
  name: string;
  slug: string;
}

export interface Genre {
  id: number;
  name: string;
  slug: string;
}

export interface Dlc {
  id: number;
  title: string;
  firstReleaseYear: number;
  dlcType: string;
  masterGameId: number;
  createdAt: string;
  masterGame?: MasterGame;
  releases?: DlcRelease[];
}

export interface DlcDetail extends Dlc {
  releases: DlcReleaseDetail[];
}

export interface DlcRelease {
  id: number;
  dlcId: number;
  providerId: number;
  mediaFormatId: number;
  releaseDate: string | null;
  onDiscForConsoleOnly: boolean;
  createdAt: string;
  provider?: Provider;
  mediaFormat?: MediaFormat;
  compatibleReleases?: Release[];
}

export interface DlcReleaseDetail extends DlcRelease {
  provider: Provider;
  mediaFormat: MediaFormat;
  compatibleReleases: Release[];
}

export interface DlcReleaseCompatibility {
  dlcReleaseId: number;
  releaseId: number;
}

export interface Collection {
  id: number;
  title: string;
  mediaFormatId: number | null;
  releaseYear: number | null;
  createdAt: string;
  mediaFormat?: MediaFormat | null;
  releases?: Release[];
  dlcReleases?: DlcRelease[];
}

export interface CollectionDetail extends Collection {
  releases: ReleaseDetail[];
  dlcReleases: DlcReleaseDetail[];
}

export interface OwnedInstance {
  id: number;
  userId: number;
  releaseId: number | null;
  dlcReleaseId: number | null;
  condition: string | null;
  location: string | null;
  notes: string | null;
  acquiredDate: string | null;
  purchasePrice: string | null;
  createdAt: string;
  updatedAt: string;
  release?: Release & {
    releaseGroup?: ReleaseGroup & { masterGame?: MasterGame };
  };
  dlcRelease?: DlcRelease & { dlc?: Dlc };
}

export interface DashboardStats {
  totalGames: number;
  totalReleases: number;
  totalSeries: number;
  totalCollections: number;
  totalUserOwned: number;
  totalFavorites: number;
  platformDistribution: { slug: string; name: string; count: number }[];
  genreBreakdown: { slug: string; name: string; count: number }[];
  recentlyAdded: OwnedInstance[];
  totalValue: number;
  collectionCompleteness: { collectionId: number; title: string; owned: number; total: number }[];
  enrichedIgdb?: number;
  enrichedOpenCritic?: number;
  enrichedHltb?: number;
  gamesWithCovers?: number;
}

export interface UserProfile {
  id: number;
  username: string;
  displayName: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}

export interface GameQueryParams {
  search?: string;
  genre?: string;
  seriesId?: number;
  platform?: string;
  provider?: string;
  sort?: "name" | "year" | "genre";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}
