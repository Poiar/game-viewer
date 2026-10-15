import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { GamesService } from "../services/games.service";
import { FavoritesService } from "../services/favorites.service";
import { MasterGameDetail } from "../types/game.types";
import { coverGradient } from "../shared/cover-placeholder";

@Component({
  selector: "app-game-detail-page",
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (loading()) {
      <div class="center-message">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    } @else if (error()) {
      <div class="center-message">
        <p>{{ error() }}</p>
        <a routerLink="/games" class="back-link">← Back to Games</a>
      </div>
    } @else if (game(); as g) {
      <a routerLink="/games" class="back-link">← Back to Games</a>

      <div class="detail-hero">
        <div class="detail-cover">
          @if (g.coverImageUrl) {
            <img [src]="g.coverImageUrl" [alt]="g.title" />
          } @else {
            <div class="cover-placeholder" [style.background]="coverGradient(g.title)">
              <span class="ph-title">{{ g.title }}</span>
              <span class="ph-year">{{ g.firstReleaseYear }}</span>
            </div>
          }
        </div>
        <div class="detail-meta">
          <div class="detail-title-row">
            <h1>{{ g.title }}</h1>
            <button
              class="fav-btn"
              [class.active]="isFav()"
              (click)="toggleFav($event, g.id)"
              [attr.aria-label]="isFav() ? 'Remove from favorites' : 'Add to favorites'"
            >
              ♥
            </button>
          </div>
          <div class="detail-tags">
            @for (genre of g.genres ?? []; track genre.id) {
              <span class="tag tag-genre">{{ genre.name }}</span>
            }
            <span class="tag">{{ g.firstReleaseYear }}</span>
            @if (g.series) {
              <span class="tag tag-accent">Series: {{ g.series.name }}</span>
            }
            @if (g.alternativeTitles.length) {
              <span class="tag tag-muted">a.k.a. {{ g.alternativeTitles.join(", ") }}</span>
            }
          </div>
          @if (g.summary || g.description) {
            <p class="detail-desc">{{ g.summary || g.description }}</p>
            @if (g.summary) {
              <span class="detail-desc-src">via IGDB</span>
            }
          }
          @if (g.criticScore || g.developer || g.publisher) {
            <div class="detail-meta-row">
              @if (g.criticScore) {
                <span class="meta-item meta-score" title="Critic score">★ {{ g.criticScore }}</span>
              }
              @if (g.developer) {
                <span class="meta-item" title="Developer">Developer: {{ g.developer }}</span>
              }
              @if (g.publisher) {
                <span class="meta-item" title="Publisher">Publisher: {{ g.publisher }}</span>
              }
            </div>
          }
          @if (g.currentLow != null && g.priceCurrency) {
            <div class="detail-meta-row">
              <span class="meta-item meta-price" title="Best current price (IsThereAnyDeal)">
                💲 {{ g.priceCurrency }} {{ g.currentLow }}
                @if (g.historicalLow != null) {
                  <span class="meta-price-low">· low {{ g.historicalLow }}</span>
                }
              </span>
            </div>
          }
          <!-- IGDB + Steam metadata -->
          @if (
            g.gameModes?.length ||
            g.playerPerspectives?.length ||
            g.ageRating ||
            g.franchise ||
            g.trailerUrl ||
            g.steamPlayers ||
            g.steamAppId
          ) {
            <div class="detail-meta-row">
              @if (g.franchise) {
                <span class="meta-item meta-franchise" title="Franchise">{{ g.franchise }}</span>
              }
              @if (g.ageRating) {
                <span class="meta-item meta-rating" title="Age rating">{{ g.ageRating }}</span>
              }
              @for (mode of g.gameModes ?? []; track mode) {
                <span class="meta-item tag-genre">{{ mode }}</span>
              }
              @for (persp of g.playerPerspectives ?? []; track persp) {
                <span
                  class="meta-item"
                  style="background:rgba(147,112,219,.12);color:#9370db;border-color:rgba(147,112,219,.25)"
                  >{{ persp }}</span
                >
              }
              @if (g.trailerUrl) {
                <a
                  class="meta-item meta-trailer"
                  [href]="g.trailerUrl"
                  target="_blank"
                  rel="noopener"
                  title="Watch trailer"
                  >▶ Trailer</a
                >
              }
              @if (g.steamPlayers != null) {
                <a
                  class="meta-item meta-steam"
                  href="https://store.steampowered.com/app/{{ g.steamAppId }}"
                  target="_blank"
                  rel="noopener"
                  title="Current Steam players"
                  >👥 {{ g.steamPlayers }} playing</a
                >
              } @else if (g.steamAppId) {
                <a
                  class="meta-item meta-steam"
                  href="https://store.steampowered.com/app/{{ g.steamAppId }}"
                  target="_blank"
                  rel="noopener"
                  title="View on Steam"
                  >Steam</a
                >
              }
            </div>
          }
          <!-- External links -->
          <div class="ext-links">
            @if (g.igdbId) {
              <a
                class="ext-link ext-igdb"
                href="https://www.igdb.com/games/{{ g.slug }}"
                target="_blank"
                rel="noopener"
                title="View on IGDB"
                >IGDB</a
              >
            } @else {
              <a
                class="ext-link ext-igdb ext-search"
                href="https://www.igdb.com/search?type=1&q={{ g.title }}"
                target="_blank"
                rel="noopener"
                title="Search on IGDB"
                >🔍 IGDB</a
              >
            }
            @if (g.opencriticId) {
              <a
                class="ext-link ext-oc"
                href="https://opencritic.com/game/{{ g.opencriticId }}"
                target="_blank"
                rel="noopener"
                title="View on OpenCritic"
              >
                OpenCritic
                @if (g.criticScore) {
                  <span class="ext-score">{{ g.criticScore }}</span>
                }
              </a>
            } @else {
              <a
                class="ext-link ext-oc ext-search"
                href="https://opencritic.com/search?q={{ g.title }}"
                target="_blank"
                rel="noopener"
                title="Search on OpenCritic"
                >🔍 OpenCritic</a
              >
            }
            @if (g.hltbId) {
              <a
                class="ext-link ext-hltb"
                href="https://howlongtobeat.com/game/{{ g.hltbId }}"
                target="_blank"
                rel="noopener"
                title="View on HowLongToBeat"
              >
                HLTB
                @if (g.hltbTime) {
                  <span class="ext-score ext-hltb-time">~{{ g.hltbTime }}h</span>
                }
              </a>
            } @else {
              <a
                class="ext-link ext-hltb ext-search"
                href="https://howlongtobeat.com/search?q={{ g.title }}"
                target="_blank"
                rel="noopener"
                title="Search on HowLongToBeat"
                >🔍 HLTB</a
              >
            }
            <button class="ext-link ext-enrich-btn" (click)="enrichGame(g.id)" [disabled]="enriching()">
              {{ enriching() ? "..." : "🔗 Enrich" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Screenshots -->
      @if (g.screenshots?.length) {
        <div class="section">
          <h2 class="section-title">Screenshots</h2>
          <div class="screenshot-strip">
            @for (url of g.screenshots; track url) {
              <img class="screenshot-thumb" [src]="url" alt="" loading="lazy" (click)="lightboxUrl.set(url)" />
            }
          </div>
        </div>
        <!-- Lightbox -->
        @if (lightboxUrl()) {
          <div class="lightbox" (click)="lightboxUrl.set(null)">
            <img class="lightbox-img" [src]="lightboxUrl()" alt="" />
            <button class="lightbox-close" (click)="lightboxUrl.set(null)">✕</button>
          </div>
        }
      }

      <!-- Release Groups -->
      @if (g.releaseGroups?.length) {
        <div class="section">
          <h2 class="section-title">Releases</h2>
          @for (rg of g.releaseGroups; track rg.id) {
            <div class="release-group-card">
              <div class="rg-header">
                <span class="rg-edition">{{ rg.editionType?.name ?? "Original" }}</span>
                @if (rg.editionName) {
                  <span class="rg-name">{{ rg.editionName }}</span>
                }
                @if (rg.releaseYear) {
                  <span class="rg-year">{{ rg.releaseYear }}</span>
                }
              </div>
              <div class="rg-releases">
                @for (rel of rg.releases; track rel.id) {
                  <div
                    class="release-row"
                    [class.owned]="!!rel.userOwns"
                    [class.expanded]="expandedRelease() === rel.id"
                    (click)="toggleExpand(rel.id)"
                  >
                    <span class="rel-chevron">{{ expandedRelease() === rel.id ? "▾" : "▸" }}</span>
                    <span class="rel-platform">{{ rel.playableOn?.join(", ") ?? "—" }}</span>
                    <span class="rel-provider">{{ rel.provider?.name ?? "—" }}</span>
                    <span class="rel-format">{{ rel.mediaFormat?.name ?? "" }}</span>
                    @if (rel.region) {
                      <span class="rel-region">{{ rel.region }}</span>
                    }
                    <span class="rel-multiplayer">
                      @if (rel.localMultiplayer === "Yes") {
                        🎮 Local
                      }
                      @if (rel.onlineMultiplayer === "Yes") {
                        🌐 Online
                      }
                    </span>
                    @if (rel.userOwns) {
                      @if (editingId() === rel.userOwns.id) {
                        <div class="rel-owned-edit">
                          <input
                            class="roe-input"
                            [value]="editCondition"
                            (input)="editCondition = $any($event.target).value"
                            placeholder="Condition"
                          />
                          <input
                            class="roe-input"
                            [value]="editLocation"
                            (input)="editLocation = $any($event.target).value"
                            placeholder="Location"
                          />
                          <input
                            class="roe-input roe-input--price"
                            [value]="editPrice"
                            (input)="editPrice = $any($event.target).value"
                            placeholder="Price"
                          />
                          <button class="roe-save" (click)="saveEdit(rel.userOwns.id)">✓</button>
                          <button class="roe-cancel" (click)="cancelEdit()">✕</button>
                        </div>
                      } @else {
                        <div class="rel-owned-details">
                          <span class="rel-owned-badge">✓</span>
                          @if (rel.userOwns.condition) {
                            <span class="rel-cond">{{ rel.userOwns.condition }}</span>
                          }
                          @if (rel.userOwns.location) {
                            <span class="rel-loc" title="Location">📍 {{ rel.userOwns.location }}</span>
                          }
                          @if (rel.userOwns.purchasePrice) {
                            <span class="rel-price" title="Price paid">💲 {{ rel.userOwns.purchasePrice }}</span>
                          }
                          @if (!rel.userOwns.condition && !rel.userOwns.location && !rel.userOwns.purchasePrice) {
                            <span class="rel-edit-hint">click ✎ to add details</span>
                          }
                          <button class="rel-edit-btn" (click)="startEdit(rel.userOwns)" title="Edit details">✎</button>
                        </div>
                      }
                    }
                    @if (expandedRelease() === rel.id) {
                      <div class="rel-expanded">
                        @if (rel.barcode) {
                          <span class="re-item"><span class="re-label">Barcode</span> {{ rel.barcode }}</span>
                        }
                        @if (rel.catalogNumber) {
                          <span class="re-item"><span class="re-label">Catalog #</span> {{ rel.catalogNumber }}</span>
                        }
                        @if (rel.publisher) {
                          <span class="re-item"><span class="re-label">Publisher</span> {{ rel.publisher }}</span>
                        }
                        @if (rel.releaseDate) {
                          <span class="re-item"><span class="re-label">Released</span> {{ rel.releaseDate }}</span>
                        }
                        <span class="re-item"
                          ><span class="re-label">Controller</span> {{ rel.controllerSupport }}</span
                        >
                        @if (rel.intendedFor?.length) {
                          <span class="re-item"
                            ><span class="re-label">Intended for</span> {{ rel.intendedFor.join(", ") }}</span
                          >
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- DLCs -->
      @if (g.dlcs?.length) {
        <div class="section">
          <h2 class="section-title">DLCs & Expansions</h2>
          <div class="dlc-grid">
            @for (dlc of g.dlcs; track dlc.id) {
              <div class="dlc-card">
                <div class="dlc-card-main">
                  <a class="dlc-title" [routerLink]="['/dlc', dlc.id]">{{ dlc.title }}</a>
                  <span class="dlc-year">{{ dlc.firstReleaseYear }}</span>
                  <span class="dlc-type">{{ dlc.dlcType }}</span>
                </div>
                @if (dlc.releases?.length) {
                  <div class="dlc-releases">
                    @for (dr of dlc.releases; track dr.id) {
                      <div class="dlc-release-row" [class.owned]="!!$any(dr).userOwns">
                        <span class="dr-provider">{{ $any(dr).provider?.name ?? "—" }}</span>
                        <span class="dr-format">{{ $any(dr).mediaFormat?.name ?? "" }}</span>
                        @if ($any(dr).onDiscForConsoleOnly) {
                          <span class="dr-disc">💿 On Disc</span>
                        }
                        @if ($any(dr).userOwns) {
                          @if (editingId() === $any(dr).userOwns.id) {
                            <div class="rel-owned-edit">
                              <input
                                class="roe-input"
                                [value]="editCondition"
                                (input)="editCondition = $any($event.target).value"
                                placeholder="Condition"
                              />
                              <input
                                class="roe-input"
                                [value]="editLocation"
                                (input)="editLocation = $any($event.target).value"
                                placeholder="Location"
                              />
                              <input
                                class="roe-input roe-input--price"
                                [value]="editPrice"
                                (input)="editPrice = $any($event.target).value"
                                placeholder="Price"
                              />
                              <button class="roe-save" (click)="saveEdit($any(dr).userOwns.id)">✓</button>
                              <button class="roe-cancel" (click)="cancelEdit()">✕</button>
                            </div>
                          } @else {
                            <div class="rel-owned-details">
                              <span class="rel-owned-badge">✓</span>
                              @if ($any(dr).userOwns.condition) {
                                <span class="rel-cond">{{ $any(dr).userOwns.condition }}</span>
                              }
                              @if ($any(dr).userOwns.location) {
                                <span class="rel-loc" title="Location">📍 {{ $any(dr).userOwns.location }}</span>
                              }
                              @if ($any(dr).userOwns.purchasePrice) {
                                <span class="rel-price" title="Price paid"
                                  >💲 {{ $any(dr).userOwns.purchasePrice }}</span
                                >
                              }
                              <button class="rel-edit-btn" (click)="startEdit($any(dr).userOwns)" title="Edit details">
                                ✎
                              </button>
                            </div>
                          }
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .center-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 80px 0;
        color: var(--text-muted);
      }
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--bg-tertiary);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .back-link {
        display: inline-block;
        color: var(--accent);
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 24px;
      }
      .back-link:hover {
        text-decoration: underline;
      }

      .detail-hero {
        display: flex;
        gap: 32px;
        margin-bottom: 40px;
      }
      .detail-cover {
        width: 200px;
        height: 280px;
        border-radius: 12px;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--bg-tertiary);
      }
      .detail-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .cover-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        height: 100%;
        padding: 16px;
        text-align: center;
      }
      .cover-placeholder .ph-title {
        font-size: 14px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
        line-height: 1.25;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        display: -webkit-box;
        -webkit-line-clamp: 5;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .cover-placeholder .ph-year {
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.75);
        letter-spacing: 0.04em;
      }

      .detail-title-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .detail-title-row h1 {
        font-size: 28px;
        font-weight: 800;
        color: var(--text-primary);
        letter-spacing: -0.03em;
        margin-bottom: 0;
      }
      .fav-btn {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid var(--border-default);
        background: var(--bg-card);
        color: var(--text-muted);
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        line-height: 1;
        padding: 0;
      }
      .fav-btn:hover {
        border-color: #f59e0b;
        color: #f59e0b;
        transform: scale(1.1);
      }
      .fav-btn.active {
        border-color: #f59e0b;
        background: #f59e0b;
        color: #fff;
      }
      .detail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
      }
      .detail-desc {
        font-size: 14px;
        color: var(--text-secondary);
        line-height: 1.6;
        max-width: 640px;
      }
      .detail-desc-src {
        font-size: 10px;
        color: var(--text-muted);
        opacity: 0.5;
        margin-left: 4px;
        font-style: italic;
      }

      .detail-meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
        align-items: center;
      }
      .meta-item {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-subtle);
        text-decoration: none;
        transition: all 0.15s;
      }
      .meta-franchise {
        background: rgba(255, 183, 77, 0.12);
        color: #ffb74d;
        border-color: rgba(255, 183, 77, 0.25);
        font-weight: 700;
      }
      .meta-rating {
        background: rgba(247, 110, 110, 0.12);
        color: #f76e6e;
        border-color: rgba(247, 110, 110, 0.25);
        font-weight: 700;
      }
      .meta-score {
        background: rgba(255, 215, 0, 0.12);
        color: #ffd700;
        border-color: rgba(255, 215, 0, 0.25);
        font-weight: 700;
      }
      .meta-price {
        background: rgba(6, 214, 160, 0.12);
        color: #06d6a0;
        border-color: rgba(6, 214, 160, 0.25);
        font-weight: 700;
      }
      .meta-price-low {
        opacity: 0.7;
        font-weight: 500;
        margin-left: 4px;
      }
      .meta-trailer {
        background: rgba(79, 195, 247, 0.12);
        color: #4fc3f7;
        border-color: rgba(79, 195, 247, 0.25);
        gap: 4px;
      }
      .meta-trailer:hover {
        background: rgba(79, 195, 247, 0.25);
      }
      .meta-steam {
        background: rgba(27, 40, 56, 0.8);
        color: #66c0f4;
        border-color: rgba(102, 192, 244, 0.3);
        gap: 4px;
        font-weight: 600;
      }
      .meta-steam:hover {
        background: rgba(102, 192, 244, 0.2);
        border-color: #66c0f4;
      }

      .ext-links {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .ext-link {
        padding: 3px 10px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 700;
        text-decoration: none;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .ext-igdb {
        background: rgba(145, 71, 255, 0.12);
        color: #9147ff;
        border: 1px solid rgba(145, 71, 255, 0.25);
      }
      .ext-igdb:hover {
        background: rgba(145, 71, 255, 0.2);
      }
      .ext-oc {
        background: rgba(247, 110, 110, 0.12);
        color: #f76e6e;
        border: 1px solid rgba(247, 110, 110, 0.25);
      }
      .ext-oc:hover {
        background: rgba(247, 110, 110, 0.2);
      }
      .ext-hltb {
        background: rgba(79, 195, 247, 0.12);
        color: var(--accent-info);
        border: 1px solid rgba(79, 195, 247, 0.25);
      }
      .ext-hltb:hover {
        background: rgba(79, 195, 247, 0.2);
      }
      .ext-search {
        opacity: 0.6;
        font-weight: 500;
      }
      .ext-score {
        background: rgba(247, 110, 110, 0.2);
        padding: 0 4px;
        border-radius: 4px;
        font-size: 10px;
      }
      .ext-hltb-time {
        background: rgba(79, 195, 247, 0.2);
        color: var(--accent-info);
      }
      .ext-enrich-btn {
        background: rgba(145, 71, 255, 0.08);
        color: #9147ff;
        border: 1px dashed rgba(145, 71, 255, 0.2);
        cursor: pointer;
        font-family: inherit;
        margin-left: auto;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 8px;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .ext-enrich-btn:hover:not(:disabled) {
        background: #9147ff;
        color: #fff;
        border-color: #9147ff;
      }
      .ext-enrich-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        border: 1px solid var(--border-subtle);
      }
      .tag-genre {
        background: rgb(6, 214, 160, 0.1);
        color: var(--accent-secondary);
        border-color: rgb(6, 214, 160, 0.25);
      }
      .tag-accent {
        background: var(--accent-glow);
        color: var(--accent);
        border-color: var(--border-accent);
      }
      .tag-muted {
        opacity: 0.7;
      }

      .section {
        margin-bottom: 40px;
      }
      .section-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 16px;
        letter-spacing: -0.01em;
      }

      .release-group-card {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        padding: 16px;
        margin-bottom: 12px;
      }
      .rg-header {
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 12px;
      }
      .rg-edition {
        font-weight: 700;
        font-size: 15px;
        color: var(--accent);
      }
      .rg-name {
        font-size: 13px;
        color: var(--accent-secondary);
      }
      .rg-year {
        font-size: 13px;
        color: var(--text-muted);
      }

      .rg-releases {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .release-row {
        display: flex;
        gap: 14px;
        align-items: center;
        padding: 8px 12px;
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
        font-size: 13px;
        transition: all 0.15s;
        cursor: pointer;
        user-select: none;
      }
      .release-row:hover {
        background: var(--bg-elevated);
      }
      .release-row.owned {
        background: rgba(6, 214, 160, 0.06);
        border-left: 3px solid var(--accent-secondary);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        padding-left: 9px;
      }
      .release-row.expanded {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        background: var(--bg-elevated);
      }
      .rel-chevron {
        width: 12px;
        font-size: 11px;
        color: var(--text-muted);
        flex-shrink: 0;
        text-align: center;
      }
      .rel-expanded {
        margin-top: -6px;
        padding: 10px 14px 12px 30px;
        background: var(--bg-elevated);
        border-radius: 0 0 var(--radius-sm) var(--radius-sm);
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        font-size: 12px;
      }
      .re-item {
        color: var(--text-secondary);
      }
      .re-label {
        font-weight: 600;
        color: var(--text-muted);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-right: 4px;
      }
      .rel-platform {
        font-weight: 600;
        color: var(--text-primary);
        min-width: 80px;
      }
      .rel-provider {
        color: var(--text-secondary);
      }
      .rel-format {
        color: var(--text-muted);
        font-size: 11px;
      }
      .rel-region {
        background: var(--bg-card);
        padding: 1px 8px;
        border-radius: 10px;
        font-size: 11px;
        color: var(--text-muted);
      }
      .rel-multiplayer {
        margin-left: auto;
        font-size: 12px;
        color: var(--text-muted);
      }
      .rel-owned-badge {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--accent-secondary);
        color: #000;
        font-size: 11px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        line-height: 1;
      }
      .rel-owned-details {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        flex-shrink: 0;
      }
      .rel-cond {
        padding: 1px 7px;
        border-radius: 8px;
        font-size: 10px;
        font-weight: 700;
        background: rgba(6, 214, 160, 0.15);
        color: var(--accent-secondary);
        white-space: nowrap;
      }
      .rel-loc {
        font-size: 11px;
        color: var(--text-muted);
        white-space: nowrap;
      }
      .rel-price {
        font-size: 11px;
        color: var(--accent-warn);
        font-weight: 600;
        white-space: nowrap;
      }
      .rel-edit-btn {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 1px solid var(--border-subtle);
        background: var(--bg-tertiary);
        color: var(--text-muted);
        cursor: pointer;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: all 0.15s;
        padding: 0;
        line-height: 1;
        flex-shrink: 0;
      }
      .release-row:hover .rel-edit-btn {
        opacity: 1;
      }
      .rel-edit-btn:hover {
        border-color: var(--accent);
        color: var(--accent);
        background: var(--accent-glow);
      }
      .rel-edit-hint {
        font-size: 10px;
        color: var(--text-muted);
        opacity: 0.6;
        font-style: italic;
      }
      .rel-owned-edit {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-left: auto;
        flex-shrink: 0;
      }
      .roe-input {
        width: 80px;
        padding: 3px 7px;
        border-radius: 6px;
        font-size: 11px;
        border: 1px solid var(--border-default);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-family: inherit;
        outline: none;
      }
      .roe-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent-glow);
      }
      .roe-input--price {
        width: 60px;
      }
      .roe-save,
      .roe-cancel {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        flex-shrink: 0;
      }
      .roe-save {
        background: var(--accent-secondary);
        color: #000;
      }
      .roe-save:hover {
        filter: brightness(1.2);
      }
      .roe-cancel {
        background: var(--bg-tertiary);
        color: var(--text-muted);
      }
      .roe-cancel:hover {
        background: rgba(247, 110, 110, 0.3);
        color: #f76e6e;
      }

      .dlc-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .dlc-card {
        padding: 12px 16px;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dlc-card-main {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .dlc-title {
        font-weight: 600;
        color: var(--text-primary);
        text-decoration: none;
        transition: color 0.15s;
      }
      .dlc-title:hover {
        color: var(--accent);
        text-decoration: underline;
      }
      .dlc-year {
        color: var(--text-secondary);
        font-size: 12px;
      }
      .dlc-type {
        color: var(--text-muted);
        font-size: 11px;
        margin-left: auto;
      }
      .dlc-releases {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .dlc-release-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 10px;
        background: var(--bg-tertiary);
        border-radius: 6px;
        font-size: 12px;
        transition: all 0.15s;
      }
      .dlc-release-row.owned {
        background: rgba(6, 214, 160, 0.06);
        border-left: 3px solid var(--accent-secondary);
        border-radius: 0 6px 6px 0;
        padding-left: 7px;
      }
      .dr-provider {
        color: var(--text-secondary);
        font-weight: 500;
      }
      .dr-format {
        color: var(--text-muted);
      }
      .dr-disc {
        color: var(--accent-info);
        font-size: 11px;
      }

      .screenshot-strip {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 8px;
        -webkit-overflow-scrolling: touch;
      }
      .screenshot-thumb {
        width: 220px;
        height: 124px;
        object-fit: cover;
        border-radius: 8px;
        cursor: pointer;
        transition:
          transform 0.15s,
          box-shadow 0.15s;
        flex-shrink: 0;
      }
      .screenshot-thumb:hover {
        transform: scale(1.03);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      }

      .lightbox {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.9);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .lightbox-img {
        max-width: 90vw;
        max-height: 90vh;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.8);
      }
      .lightbox-close {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #fff;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      .lightbox-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      @media (width <= 768px) {
        .detail-hero {
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .release-row {
          flex-wrap: wrap;
        }
        .rel-multiplayer {
          margin-left: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private gamesService = inject(GamesService);
  private fs = inject(FavoritesService);
  private http = inject(HttpClient);
  protected readonly coverGradient = coverGradient;

  game = signal<MasterGameDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  isFav(): boolean {
    return this.fs.isFavorite(this.game()?.id ?? 0);
  }
  toggleFav(event: Event, gameId: number): void {
    event.stopPropagation();
    event.preventDefault();
    this.fs.toggle(gameId);
  }

  // Inline editing
  editingId = signal<number | null>(null);
  editCondition = "";
  editLocation = "";
  editPrice = "";
  // Expandable release rows
  expandedRelease = signal<number | null>(null);
  toggleExpand(relId: number): void {
    this.expandedRelease.set(this.expandedRelease() === relId ? null : relId);
  }
  // Per-game enrichment
  enriching = signal(false);
  // Lightbox
  lightboxUrl = signal<string | null>(null);

  enrichGame(gameId: number): void {
    this.enriching.set(true);
    this.http.post(`/api/enrich/${gameId}`, {}).subscribe({
      next: (res: any) => {
        const d = res.data ?? res;
        const g = this.game();
        if (g) {
          if (d.igdbId) {
            (g as any).igdbId = d.igdbId;
            (g as any).igdbUrl = d.igdbUrl;
          }
          if (d.opencriticId) {
            (g as any).opencriticId = d.opencriticId;
          }
          if (d.opencriticScore) {
            (g as any).criticScore = d.opencriticScore;
          }
          if (d.hltbId) {
            (g as any).hltbId = d.hltbId;
          }
          if (d.hltbTime) {
            (g as any).hltbTime = d.hltbTime;
          }
          if (d.igdbSummary) {
            (g as any).summary = d.igdbSummary;
          }
          if (d.igdbCoverUrl && !g.coverImageUrl) {
            (g as any).coverImageUrl = d.igdbCoverUrl;
          }
          if (d.igdbGameModes) {
            (g as any).gameModes = d.igdbGameModes;
          }
          if (d.igdbPlayerPerspectives) {
            (g as any).playerPerspectives = d.igdbPlayerPerspectives;
          }
          if (d.igdbAgeRating) {
            (g as any).ageRating = d.igdbAgeRating;
          }
          if (d.igdbTrailerUrl) {
            (g as any).trailerUrl = d.igdbTrailerUrl;
          }
          if (d.igdbFranchise) {
            (g as any).franchise = d.igdbFranchise;
          }
          if (d.igdbSteamAppId) {
            (g as any).steamAppId = d.igdbSteamAppId;
          }
        }
        this.enriching.set(false);
      },
      error: () => this.enriching.set(false),
    });
  }

  startEdit(owned: NonNullable<MasterGameDetail["releaseGroups"][number]["releases"][number]["userOwns"]>): void {
    this.editingId.set(owned.id);
    this.editCondition = owned.condition ?? "";
    this.editLocation = owned.location ?? "";
    this.editPrice = owned.purchasePrice ?? "";
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(instanceId: number): void {
    this.http
      .put(`/api/inventory/${instanceId}`, {
        condition: this.editCondition || null,
        location: this.editLocation || null,
        purchasePrice: this.editPrice || null,
      })
      .subscribe({
        next: () => {
          const g = this.game();
          if (!g) return;
          // Update release rows
          for (const rg of g.releaseGroups) {
            for (const rel of rg.releases) {
              if (rel.userOwns?.id === instanceId) {
                (rel.userOwns as Record<string, unknown>)["condition"] = this.editCondition || null;
                (rel.userOwns as Record<string, unknown>)["location"] = this.editLocation || null;
                (rel.userOwns as Record<string, unknown>)["purchasePrice"] = this.editPrice || null;
              }
            }
          }
          // Update DLC release rows
          for (const dlc of g.dlcs) {
            for (const dr of dlc.releases ?? []) {
              if ((dr as any).userOwns?.id === instanceId) {
                ((dr as any).userOwns as Record<string, unknown>)["condition"] = this.editCondition || null;
                ((dr as any).userOwns as Record<string, unknown>)["location"] = this.editLocation || null;
                ((dr as any).userOwns as Record<string, unknown>)["purchasePrice"] = this.editPrice || null;
              }
            }
          }
          this.editingId.set(null);
        },
        error: () => {
          /* keep editing on error */
        },
      });
  }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get("slug");
    if (!slug) {
      this.error.set("No game specified");
      this.loading.set(false);
      return;
    }
    this.gamesService.getGameBySlug(slug).subscribe({
      next: (g) => {
        this.game.set(g);
        this.loading.set(false);
      },
      error: () => {
        this.error.set("Game not found");
        this.loading.set(false);
      },
    });
  }
}
