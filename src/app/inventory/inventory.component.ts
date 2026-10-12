import { Component, ChangeDetectionStrategy, inject, signal, OnInit, effect, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { AuthService } from "../services/auth.service";
import { InventoryService } from "../services/inventory.service";
import { ReleasesService } from "../services/releases.service";
import { OwnedInstance, Release } from "../types/game.types";
import { SlicePipe } from "@angular/common";
import { coverGradient } from "../shared/cover-placeholder";

@Component({
  selector: "app-inventory",
  standalone: true,
  imports: [FormsModule, SlicePipe],
  templateUrl: "./inventory.component.html",
  styleUrls: ["./inventory.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly inventoryService = inject(InventoryService);
  private readonly releasesService = inject(ReleasesService);
  protected readonly coverGradient = coverGradient;

  ownedInstances = signal<OwnedInstance[]>([]);
  releases = signal<Release[]>([]);
  loading = signal(false);

  filter = signal("");
  filterPlatform = signal<string | null>(null);
  filterCondition = signal<string | null>(null);

  filteredItems = computed(() => {
    const items = this.ownedInstances();
    const q = this.filter().trim().toLowerCase();
    const fp = this.filterPlatform();
    const fc = this.filterCondition();
    return items.filter((oi) => {
      if (q) {
        const title = oi.release?.releaseGroup?.masterGame?.title?.toLowerCase() ?? "";
        const dTitle = oi.dlcRelease?.dlc?.title?.toLowerCase() ?? "";
        const loc = oi.location?.toLowerCase() ?? "";
        if (!title.includes(q) && !dTitle.includes(q) && !loc.includes(q)) return false;
      }
      if (fp && !(oi.release?.playableOn ?? []).some((p) => p.toLowerCase() === fp.toLowerCase())) return false;
      if (fc && oi.condition?.toLowerCase() !== fc.toLowerCase()) return false;
      return true;
    });
  });

  allPlatforms = computed(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const oi of this.ownedInstances()) {
      for (const p of oi.release?.playableOn ?? []) {
        if (!seen.has(p)) {
          seen.add(p);
          result.push(p);
        }
      }
    }
    return result.sort();
  });

  selectedOwned?: OwnedInstance;
  editing?: OwnedInstance;
  showAddForm = false;
  newReleaseId: number | null = null;
  newCondition = "";
  newLocation = "";
  newNotes = "";
  newAcquiredDate = "";
  newPurchasePrice = "";

  constructor() {
    effect(() => {
      if (this.authService.isLoggedIn()) this.loadInventory();
    });
  }

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) this.loadInventory();
  }

  loadInventory(): void {
    this.loading.set(true);
    this.inventoryService.getInventory(500).subscribe({
      next: (items) => {
        this.ownedInstances.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSelect(owned: OwnedInstance): void {
    this.selectedOwned = owned;
    this.editing = undefined;
  }
  onEdit(owned: OwnedInstance): void {
    this.editing = { ...owned };
    this.selectedOwned = owned;
  }

  onSaveEdit(): void {
    if (!this.editing) return;
    this.inventoryService
      .updateItem(this.editing.id, {
        condition: this.editing.condition ?? undefined,
        location: this.editing.location ?? undefined,
        notes: this.editing.notes ?? undefined,
        acquiredDate: this.editing.acquiredDate ?? undefined,
        purchasePrice: this.editing.purchasePrice ?? undefined,
      })
      .subscribe({
        next: () => {
          this.editing = undefined;
          this.loadInventory();
        },
      });
  }

  onToggleAdd(): void {
    this.showAddForm = !this.showAddForm;
    if (this.showAddForm) this.loadReleases();
    else this.resetForm();
  }

  loadReleases(): void {
    this.releasesService.getReleases().subscribe({ next: (data) => this.releases.set(data) });
  }

  onAdd(): void {
    if (!this.newReleaseId) return;
    this.inventoryService
      .addItem({
        releaseId: this.newReleaseId ?? undefined,
        condition: this.newCondition || undefined,
        location: this.newLocation || undefined,
        notes: this.newNotes || undefined,
        acquiredDate: this.newAcquiredDate || undefined,
        purchasePrice: this.newPurchasePrice || undefined,
      })
      .subscribe({
        next: () => {
          this.resetForm();
          this.showAddForm = false;
          this.loadInventory();
        },
      });
  }

  onDelete(owned: OwnedInstance): void {
    this.inventoryService.deleteItem(owned.id).subscribe({
      next: () => {
        if (this.selectedOwned?.id === owned.id) this.selectedOwned = undefined;
        this.editing = undefined;
        this.loadInventory();
      },
    });
  }

  getReleaseLabel(r: Release): string {
    return `${r.releaseGroup?.masterGame?.title ?? "Unknown"} — ${r.releaseGroup?.editionType?.name ?? ""} (${r.playableOn?.join(", ") ?? ""}) [${r.provider?.name ?? ""}]`;
  }

  private resetForm(): void {
    this.newReleaseId = null;
    this.newCondition = "";
    this.newLocation = "";
    this.newNotes = "";
    this.newAcquiredDate = "";
    this.newPurchasePrice = "";
  }
}
