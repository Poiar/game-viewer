import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { FavoritesService } from "../services/favorites.service";
import { AuthService } from "../services/auth.service";
import { coverGradient } from "../shared/cover-placeholder";

interface FavoriteGame {
  id: number;
  title: string;
  slug: string;
  firstReleaseYear: number;
  coverImageUrl: string | null;
  favoritedAt: string;
}

@Component({
  selector: "app-favorites-page",
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="fav-header">
      <h2>Favorites ⭐</h2>
      <p>{{ total() }} saved games</p>
    </div>

    @if (loading()) {
      <div class="skeleton-grid">
        @for (i of [0, 1, 2, 3, 4, 5]; track i) {
          <div class="skeleton-card">
            <div class="skel-cover"></div>
            <div class="skel-info">
              <div class="skel-line skel-line--title"></div>
              <div class="skel-line skel-line--meta"></div>
            </div>
          </div>
        }
      </div>
    } @else if (favorites().length === 0) {
      <div class="empty">
        <div class="empty-icon">⭐</div>
        <h3>No favorites yet</h3>
        <p>Heart games on the <a routerLink="/games" class="link">Games page</a> to see them here.</p>
      </div>
    } @else {
      <div class="fav-grid">
        @for (game of favorites(); track game.id; let i = $index) {
          <article class="fav-card" [routerLink]="['/games', game.slug]" [style.--idx]="i">
            <div class="card-img-wrap">
              @if (game.coverImageUrl) {
                <img class="card-img" [src]="game.coverImageUrl" [alt]="game.title" loading="lazy" />
              } @else {
                <div class="card-img card-img--ph" [style.background]="coverGradient(game.title)">
                  <span class="ph-title">{{ game.title }}</span>
                </div>
              }
              <button class="rm-btn" (click)="remove(game.id, $event)" title="Remove">✕</button>
            </div>
            <div class="card-info">
              <h3 class="card-title" [title]="game.title">{{ game.title }}</h3>
              <span class="card-yr">{{ game.firstReleaseYear }}</span>
            </div>
          </article>
        }
      </div>
    }

    @if (totalPages() > 1) {
      <div class="pager">
        <button class="pg-btn" [disabled]="page() === 1" (click)="go(page() - 1)">Prev</button>
        @for (p of range(); track p) {
          <button class="pg-dot" [class.on]="p === page()" (click)="go(p)">{{ p }}</button>
        }
        <button class="pg-btn" [disabled]="page() >= totalPages()" (click)="go(page() + 1)">Next</button>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .fav-header {
        margin-bottom: 24px;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .fav-header h2 {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.04em;
        background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .fav-header p {
        color: var(--text-muted);
        font-size: 14px;
        margin-top: 4px;
      }

      .fav-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 18px;
      }
      .fav-card {
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        cursor: pointer;
        transition:
          transform 0.25s,
          box-shadow 0.25s,
          border-color 0.25s;
        animation: in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        animation-delay: calc(var(--idx, 0) * 40ms);
        text-decoration: none;
        display: block;
      }
      .fav-card:hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow:
          0 16px 32px rgba(0, 0, 0, 0.5),
          0 0 24px rgba(251, 191, 36, 0.15);
        border-color: rgba(251, 191, 36, 0.4);
      }
      @keyframes in {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .card-img-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 2/3;
        overflow: hidden;
      }
      .card-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.4s;
      }
      .fav-card:hover .card-img {
        transform: scale(1.06);
      }
      .card-img--ph {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        text-align: center;
      }
      .ph-title {
        font-size: 12px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
        line-height: 1.25;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
        display: -webkit-box;
        -webkit-line-clamp: 5;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .rm-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: none;
        background: rgba(0, 0, 0, 0.5);
        color: #fbbf24;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.15s;
        z-index: 3;
      }
      .fav-card:hover .rm-btn {
        opacity: 1;
        transform: scale(1);
      }
      .rm-btn:hover {
        background: rgba(247, 110, 110, 0.6);
        color: #fff;
      }

      .card-info {
        padding: 10px 12px;
      }
      .card-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .card-yr {
        font-size: 12px;
        color: var(--text-muted);
      }

      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 80px 20px;
        text-align: center;
      }
      .empty .empty-icon {
        font-size: 48px;
      }
      .empty h3 {
        font-size: 18px;
        font-weight: 700;
      }
      .empty p {
        color: var(--text-muted);
        font-size: 14px;
      }
      .link {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }
      .link:hover {
        text-decoration: underline;
      }

      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 18px;
      }
      .skeleton-card {
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--bg-card);
      }
      .skel-cover {
        width: 100%;
        aspect-ratio: 2/3;
        background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
        background-size: 200% 100%;
        animation: shim 1.5s infinite;
      }
      .skel-info {
        padding: 12px;
      }
      .skel-line {
        border-radius: 6px;
        background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-elevated) 50%, var(--bg-tertiary) 75%);
        background-size: 200% 100%;
        height: 12px;
        margin-bottom: 8px;
      }
      .skel-line--title {
        width: 80%;
        height: 14px;
      }
      .skel-line--meta {
        width: 50%;
      }
      @keyframes shim {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      .pager {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 36px;
      }
      .pg-btn {
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid var(--border-default);
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
      }
      .pg-btn:hover:not(:disabled) {
        border-color: var(--accent);
        color: var(--accent);
      }
      .pg-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .pg-dot {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: none;
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
      }
      .pg-dot:hover {
        border-color: var(--border-default);
      }
      .pg-dot.on {
        background: var(--accent);
        color: #fff;
      }

      @media (max-width: 640px) {
        .fav-grid {
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesPageComponent implements OnInit {
  private http = inject(HttpClient);
  private fs = inject(FavoritesService);
  private auth = inject(AuthService);
  protected readonly coverGradient = coverGradient;

  favorites = signal<FavoriteGame[]>([]);
  loading = signal(true);
  page = signal(1);
  totalPages = signal(1);
  total = signal(0);
  readonly limit = 48;

  ngOnInit(): void {
    const load = () => {
      if (this.auth.isLoggedIn()) {
        this.fetch();
      } else {
        setTimeout(load, 500);
      }
    };
    load();
  }

  fetch(): void {
    this.loading.set(true);
    this.http.get<any>(`/api/favorites?page=${this.page()}&limit=${this.limit}`).subscribe({
      next: (res) => {
        this.favorites.set(res.data);
        this.total.set(res.meta?.total ?? 0);
        this.totalPages.set(res.meta?.totalPages ?? 1);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  remove(gameId: number, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.fs.toggle(gameId);
    this.favorites.update((list) => list.filter((g) => g.id !== gameId));
    this.total.update((t) => t - 1);
  }

  go(p: number): void {
    this.page.set(p);
    this.fetch();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  range(): number[] {
    const c = this.page();
    const t = this.totalPages();
    const r: number[] = [];
    for (let i = Math.max(1, c - 2); i <= Math.min(t, c + 2); i++) r.push(i);
    return r;
  }
}
