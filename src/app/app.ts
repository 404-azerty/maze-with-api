import {
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { MazeStore } from './shared/stores/_index';
import { MazeService } from './shared/services/_index';
import { Cell } from './shared/interfaces/_index';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { PlayerDialog } from './dialogs/_index';

@Component({
  selector: 'app-root',
  imports: [NgClass, MatButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly dialog = inject(MatDialog);
  private readonly mazeService = inject(MazeService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  protected readonly mazeStore = inject(MazeStore);
  protected grid = signal<(Cell | null)[][]>([]);
  protected playerKey = '';

  private readonly updatePlayerKey = effect(() => {
    const { x, y } = this.mazeStore.position();
    this.playerKey = `${x},${y}`;
    this.changeDetectorRef.detectChanges();
  });

  private readonly updateGrid = effect(() => {
    const cells = this.getCells();
    this.grid.set(this.buildGrid(cells));
  });

  public trackByRow = (_: any, rowIndex: number): string => {
    return `row-${rowIndex}`;
  };

  public trackByCell = (cell: Cell | null, colIndex: number): string => {
    if (!cell) {
      return `empty-${colIndex}`;
    }
    return `${cell.x},${cell.y}`;
  };

  public ngOnDestroy(): void {
    this.updatePlayerKey.destroy();
    this.updateGrid.destroy();
  }

  public async onStartGame(): Promise<void> {
    this.dialog
      .open(PlayerDialog)
      .afterClosed()
      .subscribe((result: { playerName: string } | undefined) => {
        if (!result) {
          return;
        }

        this.startGame(result.playerName);
      });
  }

  public onResetGame(): void {
    this.mazeStore.reset();
    this.buildGrid([]);
  }

  public buildGrid(cells: Cell[]): (Cell | null)[][] {
    if (!cells.length) {
      return [];
    }

    // on récupère tous les x et les y pour obtenir les tailles des axes
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // on calcule la taille de la grille
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    // on créé une grille vide
    const grid: (Cell | null)[][] = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => null)
    );

    // on ajoute les cellules que l'on connait dans la grille
    for (const cell of cells) {
      const row = cell.y - minY;
      const col = cell.x - minX;
      grid[row][col] = cell;
    }

    return grid;
  }

  public getCellClass(cell: Cell | null): string[] {
    if (!cell) {
      return ['empty'];
    }

    const key = `${cell.x},${cell.y}`;
    const classes = ['maze-cell'];

    classes.push(cell.value);

    if (key === this.playerKey) {
      classes.push('player');
    }

    return classes;
  }

  private async startGame(playerName: string) {
    try {
      const data = await firstValueFrom(this.mazeService.startGame(playerName));

      this.mazeStore.updateFromStart(data);

      await this.mazeStore.explore();
      await this.mazeStore.followShortestPath();
    } catch (err) {
      console.error('Erreur lors du démarrage du jeu :', err);
    }
  }

  private getCells(): Cell[] {
    return Array.from(this.mazeStore.map().values());
  }
}
