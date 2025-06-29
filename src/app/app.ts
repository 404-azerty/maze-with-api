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
import { CELL_TYPE } from './shared/enums/cell.enum';

@Component({
  selector: 'app-root',
  imports: [NgClass],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
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

  private readonly playerName = 'Johanne';

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
  }

  // Lancement d'une nouvelle partie
  public async startGame(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.mazeService.startGame(this.playerName)
      );
      this.mazeStore.updateFromStart(data);
      await this.mazeStore.explore();
      await this.mazeStore.followShortestPath();
    } catch (err) {
      console.error('Erreur lors du démarrage du jeu :', err);
    }
  }

  // Construction de la grille au fur et à mesure
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

    if (key === this.playerKey) {
      classes.push('player');
    }

    switch (cell.value) {
      case 'wall':
        classes.push('wall');
        break;
      case 'trap':
        classes.push('trap');
        break;
      case 'stop':
        classes.push('stop');
        break;
      default:
        classes.push('path');
    }

    return classes;
  }

  // Récupération des cellules visibles depuis la map
  private getCells(): Cell[] {
    return Array.from(this.mazeStore.map().values());
  }
}
