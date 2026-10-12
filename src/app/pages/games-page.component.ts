import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from "@angular/core";
import { RouterLink, ActivatedRoute } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { FavoritesService } from "../services/favorites.service";
import { GamesService } from "../services/games.service";
import { LookupService } from "../services/lookup.service";
import { AuthService } from "../services/auth.service";
import { MasterGame, Genre } from "../types/game.types";
import { coverGradient } from "../shared/cover-placeholder";

@Component({
  selector: "app-games-page",
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div class="header-content">
        <h2>Games</h2>
        <p>{{ total() }} titles in your catalog</p>
      </div>
      <div class="header-stats">
        <div class="stat">
          <span class="stat-value">{{ total() }}</span>
          <span class="stat-label">Games</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ genres().length }}</span>
          <span class="stat-label">Genres</span>
        </div>
      </div>
      <button class="header-fetch-btn" (click)="fetchCovers()" [disabled]="fetchingCovers()">
        {{ fetchingCovers() ? "Fetching covers..." : "🎨 Fetch Covers" }}
      </button>
    </div>
    @if (coverResult()) {
      <div class="header-cover-result">{{ coverResult() }}</div>
    }

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          class="search-input"
          type="text"
          placeholder="Search titles, series, aliases..."
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
        />
        @if (searchQuery) {
          <button class="search-clear" (click)="searchQuery = ''; onSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        }
      </div>

      <!-- Active filter pills -->
      @if (selectedPlatform() || selectedProvider()) {
        <div class="active-filters">
          <span class="af-label">Active filters:</span>
          @if (selectedPlatform()) {
            <span class="af-chip"
              >🖥️ {{ selectedPlatform() }}
              <button class="af-remove" (click)="selectedPlatform.set(null); page.set(1); loadGames()">✕</button>
            </span>
          }
          @if (selectedProvider()) {
            <span class="af-chip"
              >🏪 {{ selectedProvider() }}
              <button class="af-remove" (click)="selectedProvider.set(null); page.set(1); loadGames()">✕</button>
            </span>
          }
        </div>
      }

      <div class="filter-controls">
        <div class="filter-group">
          <span class="filter-label">Genre</span>
          <div class="genre-chips">
            <button class="chip" [class.active]="!selectedGenre()" (click)="setGenre(null)">All</button>
            @for (g of genres(); track g.slug) {
              <button class="chip" [class.active]="selectedGenre() === g.slug" (click)="setGenre(g.slug)">
                {{ g.name }}
              </button>
            }
          </div>
        </div>

        <div class="filter-group filter-group--right">
          <span class="filter-label">Sort</span>
          <div class="sort-row">
            <button class="chip chip--sort" [class.active]="sort() === 'name'" (click)="setSort('name')">
              <span>Name</span>
              @if (sort() === "name") {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="sort-arrow">
                  @if (order() === "asc") {
                    <path d="M12 5v14M5 12l7-7 7 7" />
                  } @else {
                    <path d="M12 19V5M5 12l7 7 7-7" />
                  }
                </svg>
              }
            </button>
            <button class="chip chip--sort" [class.active]="sort() === 'year'" (click)="setSort('year')">
              <span>Year</span>
              @if (sort() === "year") {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="sort-arrow">
                  @if (order() === "asc") {
                    <path d="M12 5v14M5 12l7-7 7 7" />
                  } @else {
                    <path d="M12 19V5M5 12l7 7 7-7" />
                  }
                </svg>
              }
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    @if (loading()) {
      <div class="skeleton-grid">
        @for (i of skeletonItems; track i) {
          <div class="skeleton-card">
            <div class="skeleton-cover"></div>
            <div class="skeleton-info">
              <div class="skeleton-line skeleton-line--title"></div>
              <div class="skeleton-line skeleton-line--meta"></div>
            </div>
          </div>
        }
      </div>
    } @else if (games().length === 0) {
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.172 14.828L12 12M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h3>No games found</h3>
        <p>Try adjusting your search or filter criteria</p>
        <button class="btn-reset" (click)="resetFilters()">Reset filters</button>
      </div>
    } @else {
      <!-- Game Grid -->
      <div class="games-grid">
        @for (game of games(); track game.id; let i = $index) {
          <article
            class="game-card"
            [class.has-cover]="game.coverImageUrl"
            [routerLink]="game.slug ? ['/games', game.slug] : null"
            [class.no-link]="!game.slug"
            [style.--card-index]="i"
          >
            <div class="card-cover-wrap">
              @if (game.coverImageUrl) {
                <img
                  class="card-cover"
                  [src]="game.coverImageUrl"
                  [alt]="game.title"
                  loading="lazy"
                  width="300"
                  height="422"
                />
              } @else {
                <div class="card-cover card-cover--placeholder" [style.background]="coverGradient(game.title)">
                  <span class="placeholder-title">{{ game.title }}</span>
                  <span class="placeholder-year">{{ game.firstReleaseYear }}</span>
                </div>
              }

              <!-- Owned count badge -->
              @if ((game.ownedReleases ?? []).length > 0) {
                <span class="owned-count-badge">
                  {{ (game.ownedReleases ?? []).length }}
                </span>
              }

              <!-- Critic score badge -->
              @if (game.criticScore) {
                <span class="critic-badge">{{ game.criticScore }}</span>
              }

              <!-- Steam players badge -->
              @if (game.steamPlayers != null) {
                <span class="steam-badge" title="Current Steam players">👥 {{ game.steamPlayers }}</span>
              }

              <!-- Hover overlay -->
              <div class="card-overlay">
                <div class="overlay-top">
                  <button
                    class="fav-btn"
                    [class.is-favorite]="isFavorite(game.id)"
                    (click)="toggleFavorite(game.id, $event)"
                    [attr.aria-label]="isFavorite(game.id) ? 'Remove from favorites' : 'Add to favorites'"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      @if (isFavorite(game.id)) {
                        <path
                          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                          fill="currentColor"
                        />
                      } @else {
                        <path
                          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                        />
                      }
                    </svg>
                  </button>
                </div>
                <div class="overlay-bottom">
                  <div class="overlay-genres">
                    @for (g of (game.genres ?? []).slice(0, 2); track g.id) {
                      <span class="overlay-tag">{{ g.name }}</span>
                    }
                  </div>
                  @if ((game.ownedReleases ?? []).length > 0) {
                    <div class="overlay-owned">
                      @for (rel of (game.ownedReleases ?? []).slice(0, 4); track $index) {
                        <span class="overlay-owned-chip">
                          {{ rel.platforms.join("/") }}
                          @if (rel.formats[0]) {
                            <span class="ooc-fmt">· {{ rel.formats[0] }}</span>
                          }
                        </span>
                      }
                      @if ((game.ownedReleases ?? []).length > 4) {
                        <span class="overlay-owned-chip">+{{ (game.ownedReleases ?? []).length - 4 }}</span>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="card-body">
              <h3 class="card-title" [title]="game.title">{{ game.title }}</h3>
              <div class="card-meta">
                <span class="card-year">{{ game.firstReleaseYear }}</span>
                @if ((game.genres ?? []).length > 0) {
                  <span class="card-genre-dot"></span>
                  <span class="card-genre">{{ (game.genres ?? [])[0].name }}</span>
                }
              </div>
              @if ((game.ownedReleases ?? []).length > 0) {
                <div class="card-owned">
                  @for (rel of (game.ownedReleases ?? []).slice(0, 3); track $index) {
                    <span class="owned-badge">
                      {{ rel.platforms[0] ?? "Unknown" }}
                      @if (rel.formats[0]) {
                        <span class="owned-badge-format">· {{ rel.formats[0] }}</span>
                      }
                    </span>
                  }
                  @if ((game.ownedReleases ?? []).length > 3) {
                    <span class="owned-badge owned-badge--more">+{{ (game.ownedReleases ?? []).length - 3 }} more</span>
                  }
                </div>
              }
            </div>
          </article>
        }
      </div>
    }

    <!-- Pagination -->
    @if (totalPages() > 1) {
      <div class="pagination">
        <button class="page-btn" [disabled]="page() === 1" (click)="goPage(page() - 1)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
          Prev
        </button>
        <div class="page-dots">
          @if (page() > 3) {
            <button class="page-dot" (click)="goPage(1)">1</button>
            <span class="page-ellipsis">…</span>
          }
          @for (p of pageRange(); track p) {
            <button class="page-dot" [class.active]="p === page()" (click)="goPage(p)">{{ p }}</button>
          }
          @if (page() < totalPages() - 2) {
            <span class="page-ellipsis">…</span>
            <button class="page-dot" (click)="goPage(totalPages())">{{ totalPages() }}</button>
          }
        </div>
        <button class="page-btn" [disabled]="page() >= totalPages()" (click)="goPage(page() + 1)">
          Next
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ── Page Header ─────────────────────────────── */
      .page-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        margin-bottom: 32px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .header-content h2 {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.04em;
        background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .header-content p {
        color: var(--text-muted);
        font-size: 14px;
        margin-top: 4px;
      }
      .header-stats {
        display: flex;
        gap: 24px;
        align-items: center;
      }
      .header-fetch-btn {
        margin-left: 8px;
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid var(--border-accent);
        background: var(--accent-glow);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .header-fetch-btn:hover:not(:disabled) {
        background: var(--accent);
        color: #fff;
      }
      .header-fetch-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .header-cover-result {
        font-size: 12px;
        color: var(--accent-secondary);
        font-weight: 600;
        margin-top: 6px;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .stat-value {
        font-size: 22px;
        font-weight: 800;
        color: var(--accent);
        letter-spacing: -0.03em;
        line-height: 1;
      }
      .stat-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
        font-weight: 600;
      }

      /* ── Filter Bar ──────────────────────────────── */
      .filter-bar {
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-xl);
        padding: 20px 24px;
        margin-bottom: 28px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        backdrop-filter: blur(8px);
      }

      .search-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: 12px;
        padding: 12px 16px;
        transition: all var(--transition-fast);
      }
      .search-wrap:focus-within {
        border-color: var(--accent);
        box-shadow:
          0 0 0 3px var(--accent-glow),
          0 0 20px var(--accent-glow);
      }
      .search-icon {
        width: 18px;
        height: 18px;
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .search-input {
        flex: 1;
        background: none;
        border: none;
        color: var(--text-primary);
        font-size: 14px;
        outline: none;
        font-family: inherit;
      }
      .search-input::placeholder {
        color: var(--text-muted);
      }

      /* Active filter pills */
      .active-filters {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .af-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
      }
      .af-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px 4px 12px;
        border-radius: 20px;
        background: var(--accent-glow);
        border: 1px solid var(--border-accent);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
      }
      .af-remove {
        background: none;
        border: none;
        color: var(--accent);
        cursor: pointer;
        font-size: 12px;
        padding: 0 2px;
        line-height: 1;
        font-family: inherit;
        opacity: 0.6;
        transition: opacity 0.15s;
      }
      .af-remove:hover {
        opacity: 1;
      }

      .search-clear {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px;
        display: flex;
        color: var(--text-muted);
        transition: color var(--transition-fast);
      }
      .search-clear:hover {
        color: var(--text-primary);
      }
      .search-clear svg {
        width: 14px;
        height: 14px;
      }

      .filter-controls {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .filter-group {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .filter-group--right {
        justify-content: space-between;
      }
      .filter-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-muted);
        white-space: nowrap;
        min-width: 48px;
      }

      .genre-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .sort-row {
        display: flex;
        gap: 6px;
      }

      .chip {
        padding: 5px 13px;
        border-radius: 20px;
        border: 1px solid var(--border-default);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
        font-family: inherit;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .chip:hover {
        border-color: var(--accent);
        color: var(--text-primary);
        background: var(--bg-elevated);
      }
      .chip.active {
        background: var(--accent-glow);
        color: var(--accent);
        border-color: var(--accent);
        box-shadow: 0 0 12px var(--accent-glow);
      }
      .chip--sort {
        min-width: 72px;
        justify-content: center;
      }
      .sort-arrow {
        width: 14px;
        height: 14px;
      }

      /* ── Skeleton Loading ─────────────────────────── */
      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 20px;
      }
      .skeleton-card {
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--bg-card);
        animation: shimmer 1.5s infinite;
      }
      .skeleton-cover {
        width: 100%;
        aspect-ratio: 2/3;
        background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
        background-size: 200% 100%;
      }
      .skeleton-info {
        padding: 12px;
      }
      .skeleton-line {
        border-radius: 6px;
        background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
        background-size: 200% 100%;
        height: 12px;
        margin-bottom: 8px;
      }
      .skeleton-line--title {
        width: 80%;
        height: 14px;
      }
      .skeleton-line--meta {
        width: 50%;
      }
      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* ── Empty State ─────────────────────────────── */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 20px;
        gap: 12px;
        text-align: center;
      }
      .empty-icon {
        width: 64px;
        height: 64px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-subtle);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 8px;
      }
      .empty-icon svg {
        width: 28px;
        height: 28px;
        color: var(--text-muted);
      }
      .empty-state h3 {
        font-size: 18px;
        font-weight: 700;
        color: var(--text-primary);
      }
      .empty-state p {
        color: var(--text-muted);
        font-size: 14px;
      }
      .btn-reset {
        margin-top: 8px;
        padding: 8px 20px;
        border-radius: 20px;
        border: 1px solid var(--accent);
        background: var(--accent-glow);
        color: var(--accent);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
        font-family: inherit;
      }
      .btn-reset:hover {
        background: var(--accent);
        color: #fff;
      }

      /* ── Games Grid ──────────────────────────────── */
      .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 20px;
      }

      .game-card {
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        cursor: pointer;
        transition:
          transform var(--transition-normal),
          box-shadow var(--transition-normal),
          border-color var(--transition-normal);
        animation: cardEntrance 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        animation-delay: calc(var(--card-index, 0) * 30ms);
        text-decoration: none;
        display: block;
      }
      .game-card:hover {
        transform: translateY(-6px) scale(1.02);
        box-shadow:
          0 20px 40px rgba(0, 0, 0, 0.5),
          0 0 30px var(--accent-glow);
        border-color: var(--border-accent);
      }
      .game-card.no-link {
        cursor: default;
      }
      .game-card.no-link:hover {
        transform: none;
        box-shadow: none;
        border-color: var(--border-subtle);
      }

      @keyframes cardEntrance {
        from {
          opacity: 0;
          transform: translateY(16px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .card-cover-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 2/3;
        overflow: hidden;
      }
      .card-cover {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
      }
      .game-card:hover .card-cover {
        transform: scale(1.08);
      }

      .card-cover--placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 16px;
        text-align: center;
      }
      .placeholder-title {
        font-size: 13px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
        line-height: 1.25;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .placeholder-year {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.72);
        letter-spacing: 0.04em;
      }

      /* Owned count badge */
      .owned-count-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        min-width: 26px;
        height: 26px;
        padding: 0 7px;
        border-radius: 13px;
        background: var(--accent);
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: -0.02em;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow:
          0 2px 8px rgba(0, 0, 0, 0.5),
          0 0 12px rgba(124, 106, 247, 0.4);
        z-index: 2;
        transition:
          transform var(--transition-fast),
          box-shadow var(--transition-fast);
        line-height: 1;
        pointer-events: none;
      }
      .game-card:hover .owned-count-badge {
        transform: scale(0.85);
        box-shadow:
          0 1px 4px rgba(0, 0, 0, 0.4),
          0 0 6px rgba(124, 106, 247, 0.2);
      }

      .critic-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        min-width: 26px;
        height: 26px;
        padding: 0 7px;
        border-radius: 13px;
        background: rgba(247, 110, 110, 0.9);
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: -0.02em;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow:
          0 2px 8px rgba(0, 0, 0, 0.5),
          0 0 12px rgba(247, 110, 110, 0.4);
        z-index: 2;
        transition:
          transform var(--transition-fast),
          box-shadow var(--transition-fast);
        line-height: 1;
        pointer-events: none;
      }
      .game-card:hover .critic-badge {
        transform: scale(0.85);
        box-shadow:
          0 1px 4px rgba(0, 0, 0, 0.4),
          0 0 6px rgba(247, 110, 110, 0.2);
      }

      /* Steam badge */
      .steam-badge {
        position: absolute;
        top: 40px;
        left: 8px;
        height: 22px;
        padding: 0 7px;
        display: flex;
        align-items: center;
        gap: 3px;
        background: rgba(27, 40, 56, 0.92);
        color: #66c0f4;
        border: 1px solid rgba(102, 192, 244, 0.35);
        border-radius: 7px;
        font-size: 10px;
        font-weight: 700;
        font-family: var(--font-mono);
        z-index: 2;
        pointer-events: none;
        transition:
          transform var(--transition-fast),
          box-shadow var(--transition-fast);
      }
      .game-card:hover .steam-badge {
        transform: scale(0.85);
        box-shadow:
          0 1px 4px rgba(0, 0, 0, 0.4),
          0 0 6px rgba(102, 192, 244, 0.2);
      }

      /* Overlay */
      .card-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          rgba(0, 0, 0, 0) 0%,
          rgba(0, 0, 0, 0) 40%,
          rgba(0, 0, 0, 0.7) 75%,
          rgba(0, 0, 0, 0.9) 100%
        );
        opacity: 0;
        transition: opacity var(--transition-normal);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 12px;
      }
      .game-card:hover .card-overlay {
        opacity: 1;
      }

      .overlay-top {
        display: flex;
        justify-content: flex-end;
      }
      .fav-btn {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--transition-fast);
        transform: scale(0.8);
      }
      .game-card:hover .fav-btn {
        transform: scale(1);
      }
      .fav-btn:hover {
        background: rgba(255, 255, 255, 0.25);
      }
      .fav-btn.is-favorite {
        background: rgba(247, 110, 110, 0.3);
        color: #f76e6e;
      }
      .fav-btn svg {
        width: 16px;
        height: 16px;
      }

      .overlay-bottom {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .overlay-genres {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .overlay-owned {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
      }
      .overlay-owned-chip {
        padding: 1px 6px;
        border-radius: 8px;
        font-size: 9px;
        font-weight: 700;
        background: rgba(79, 195, 247, 0.2);
        color: var(--accent-info);
        border: 1px solid rgba(79, 195, 247, 0.3);
      }
      .ooc-fmt {
        opacity: 0.7;
      }
      .overlay-tag {
        padding: 2px 8px;
        border-radius: 10px;
        background: rgba(6, 214, 160, 0.25);
        border: 1px solid rgba(6, 214, 160, 0.4);
        color: #06d6a0;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .card-body {
        padding: 12px;
      }
      .card-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1.3;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .card-meta {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .card-year {
        font-size: 12px;
        color: var(--text-muted);
        font-weight: 500;
      }
      .card-genre-dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: var(--text-muted);
      }
      .card-genre {
        font-size: 12px;
        color: var(--accent-secondary);
        font-weight: 500;
      }

      .card-owned {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--border-subtle);
      }
      .owned-badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 7px;
        border-radius: 10px;
        background: var(--accent-glow);
        border: 1px solid var(--border-accent);
        color: var(--accent);
        font-size: 10px;
        font-weight: 600;
        white-space: nowrap;
      }
      .owned-badge-format {
        opacity: 0.7;
        font-weight: 500;
      }
      .owned-badge--more {
        background: var(--bg-tertiary);
        border-color: var(--border-default);
        color: var(--text-muted);
        font-size: 10px;
      }

      /* ── Pagination ──────────────────────────────── */
      .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 40px;
        padding: 20px 0;
      }
      .page-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 10px;
        border: 1px solid var(--border-default);
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
        font-family: inherit;
      }
      .page-btn:hover:not(:disabled) {
        border-color: var(--accent);
        color: var(--accent);
        background: var(--accent-glow);
      }
      .page-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .page-btn svg {
        width: 16px;
        height: 16px;
      }
      .page-dots {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .page-dot {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: none;
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
        font-family: inherit;
      }
      .page-dot:hover {
        border-color: var(--border-default);
        color: var(--text-primary);
      }
      .page-dot.active {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
        box-shadow: 0 0 12px var(--accent-glow);
      }
      .page-ellipsis {
        color: var(--text-muted);
        font-size: 13px;
        padding: 0 4px;
      }

      /* ── Responsive ──────────────────────────────── */
      @media (max-width: 640px) {
        .page-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 16px;
        }
        .filter-bar {
          padding: 16px;
        }
        .filter-group--right {
          flex-direction: column;
          align-items: flex-start;
        }
        .games-grid {
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 14px;
        }
        .skeleton-grid {
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 14px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamesPageComponent implements OnInit {
  private favoritesService = inject(FavoritesService);
  private gamesService = inject(GamesService);
  private lookupService = inject(LookupService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  protected readonly coverGradient = coverGradient;

  games = signal<MasterGame[]>([]);
  genres = signal<Genre[]>([]);
  loading = signal(true);
  total = signal(0);
  totalPages = signal(1);
  page = signal(1);
  limit = 50;

  searchQuery = "";
  selectedGenre = signal<string | null>(null);
  selectedPlatform = signal<string | null>(null);
  selectedProvider = signal<string | null>(null);
  sort = signal<"name" | "year">("name");
  order = signal<"asc" | "desc">("asc");

  skeletonItems = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  private searchTimeout?: ReturnType<typeof setTimeout>;
  fetchingCovers = signal(false);
  coverResult = signal<string | null>(null);

  fetchCovers(): void {
    this.fetchingCovers.set(true);
    this.coverResult.set(null);
    this.gamesService.bulkFetchCovers(25).subscribe({
      next: (d) => {
        this.coverResult.set(`✓ ${d.fetched} covers fetched`);
        this.fetchingCovers.set(false);
        this.loadGames();
      },
      error: () => {
        this.coverResult.set("Error fetching covers");
        this.fetchingCovers.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.lookupService.getGenres().subscribe((genres) => this.genres.set(genres));
    // Read query params for platform/provider filters
    this.route.queryParams.subscribe((params) => {
      if (params["platform"]) this.selectedPlatform.set(params["platform"]);
      if (params["provider"]) this.selectedProvider.set(params["provider"]);
      if (params["genre"]) this.selectedGenre.set(params["genre"]);
    });
    const load = () => {
      if (this.auth.isLoggedIn()) {
        this.loadGames();
      } else {
        setTimeout(load, 500);
      }
    };
    load();
  }

  loadGames(): void {
    this.loading.set(true);
    this.gamesService
      .getGames({
        search: this.searchQuery || undefined,
        genre: this.selectedGenre() ?? undefined,
        platform: this.selectedPlatform() ?? undefined,
        provider: this.selectedProvider() ?? undefined,
        sort: this.sort(),
        order: this.order(),
        page: this.page(),
        limit: this.limit,
      })
      .subscribe({
        next: (res) => {
          this.games.set(res.data);
          this.total.set(res.meta?.total ?? 0);
          this.totalPages.set(res.meta?.totalPages ?? 1);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onSearch(): void {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.page.set(1);
      this.loadGames();
    }, 300);
  }

  setGenre(slug: string | null): void {
    this.selectedGenre.set(slug);
    this.page.set(1);
    this.loadGames();
  }

  setSort(s: "name" | "year"): void {
    if (this.sort() === s) {
      this.order.update((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      this.sort.set(s);
      this.order.set("asc");
    }
    this.loadGames();
  }

  goPage(p: number): void {
    this.page.set(p);
    this.loadGames();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  resetFilters(): void {
    this.searchQuery = "";
    this.selectedGenre.set(null);
    this.sort.set("name");
    this.order.set("asc");
    this.page.set(1);
    this.loadGames();
  }

  pageRange(): number[] {
    const current = this.page();
    const total = this.totalPages();
    const range: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  }

  isFavorite(gameId: number): boolean {
    return this.favoritesService.isFavorite(gameId);
  }

  toggleFavorite(gameId: number, event: Event): void {
    event.stopPropagation();
    this.favoritesService.toggle(gameId);
  }
}
