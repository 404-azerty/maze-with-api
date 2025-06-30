import { Injectable, effect, inject } from '@angular/core';
import { signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { ApiResponse, Cell, CellCoordinates } from '../interfaces/_index';
import { MazeService } from '../services/maze.service';
import { CELL_TYPE } from '../enums/_index';

@Injectable({ providedIn: 'root' })
export class MazeStore {
  private readonly mazeService = inject(MazeService);

  // états internes du labyrinthe
  private _position = signal<CellCoordinates>({ x: 0, y: 0 });
  private _map = signal(new Map<string, Cell>());
  private _isDead = signal(false);
  private _isWin = signal(false);
  private _moveUrl = signal('');
  private _discoverUrl = signal('');
  private _log = signal<string[]>([]);
  private _visited = signal(new Set<string>());
  private _isExploring = signal(false);
  private _isFinish = signal(false);
  // pour gérer les impasses et les chemins les plus courts, on a besoin d'avoir tous les chemins et leurs longueurs
  private _results = signal<{ path: CellCoordinates[]; length: number }[]>([]);
  private isExploringNow = false;

  // getters pour le composant si besoin
  get position() {
    return this._position;
  }

  get map() {
    return this._map;
  }

  get dead() {
    return this._isDead;
  }

  get win() {
    return this._isWin;
  }

  get moveUrl() {
    return this._moveUrl;
  }

  get discoverUrl() {
    return this._discoverUrl;
  }

  get log() {
    return this._log;
  }

  get visited() {
    return this._visited;
  }

  get isExploring() {
    return this._isExploring;
  }

  get isFinish() {
    return this._isFinish;
  }

  get results() {
    return this._results;
  }

  constructor() {
    // fonction qui s'execute à chaque changement des signals situés dans le if
    // on explore la carte si une nouvelle url est disponible et qu'on n'est pas déjà en train d'explorer
    // donc, tant que le jeu n’est pas terminé et qu’on est en mode exploration, on tente une exploration dès que l’état change, sans se relancer plusieurs fois en parallèle
    effect(() => {
      if (this._discoverUrl() && this._isExploring() && !this.isExploringNow) {
        this.isExploringNow = true;

        this.exploreNext().finally(() => {
          this.isExploringNow = false;
        });
      }
    });
  }

  /**
   * Réinitialisation des états d'origine
   */
  public reset(): void {
    this._position.set({ x: 0, y: 0 });
    this._map.set(new Map());
    this._isDead.set(false);
    this._isWin.set(false);
    this._moveUrl.set('');
    this._discoverUrl.set('');
    this._log.set([]);
    this._visited.set(new Set());
    this._isExploring.set(false);
    this._results.set([]);
    this._isFinish.set(false);
    this.isExploringNow = false;
  }

  /**
   * Met à jour l’état du jeu après avoir lancé une nouvelle partie.
   * Réinitialise la liste des positions visitées pour repartir de zéro.
   * @param data Données renvoyées par l’API après un mouvement
   */
  public updateFromStart(data: ApiResponse): void {
    this.reset();
    this._isExploring.set(true);
    this.updateGameState(data, true);
  }

  /**
   * Point d'entrée principal pour explorer le labyrinthe.
   * Utilise une recherche en profondeur pour trouver tous les chemins sûrs vers la sortie.
   */
  public async explore(): Promise<void> {
    const start = this._position();
    const allPaths = await this.startExploration(start);

    if (!allPaths.length) {
      this.addLog('Aucun chemin vers la sortie trouvé.');
      return;
    }

    this._results.set(allPaths);
    this.logPaths(allPaths);
  }

  /**
   * Fait suivre à l'utilisateur le chemin le plus court vers la sortie.
   */
  public async followShortestPath(): Promise<void> {
    const results = this._results();

    if (!results.length) {
      this.addLog('Aucun chemin disponible vers la sortie.');
      this.isFinish.set(true);
      return;
    }

    const shortest = results[0];

    this.addLog(`Début du trajet vers la sortie (${shortest.length} étapes).`);

    // On ignore la première cellule qui est la position actuelle
    const steps = shortest.path.slice(1);

    for (const step of steps) {
      try {
        await this.moveToCell(step);
        this.addLog(`Déplacement vers (${step.x}, ${step.y})`);
      } catch (err) {
        this.addLog(`Échec déplacement vers (${step.x}, ${step.y}) : ${err}`);
        return;
      }
    }

    this.finishExploration('Le joueur est arrivé à la sortie !');
    this.isFinish.set(true);
    console.log(this.log());
  }

  /**
   * Initialise la structure de l'exploration et lance la recherche.
   * @param start - Position de départ
   */
  private async startExploration(
    start: CellCoordinates
  ): Promise<{ path: CellCoordinates[]; length: number }[]> {
    const visited = new Set<string>();
    const allPaths: { path: CellCoordinates[]; length: number }[] = [];

    await this.exploreFromCell([start], visited, allPaths);
    return allPaths;
  }

  /**
   * Explore récursivement le labyrinthe à partir du chemin courant.
   * @param path - Chemin actuel parcouru
   * @param visited - Coordonnées déjà explorées
   * @param allPaths - Tous les chemins sûrs trouvés
   */
  private async exploreFromCell(
    path: CellCoordinates[],
    visited: Set<string>,
    allPaths: { path: CellCoordinates[]; length: number }[]
  ): Promise<void> {
    const current = this.getCurrentCellFromPath(path);
    const key = this.coordKey(current);

    if (this.isVisited(key, visited)) {
      return;
    }

    this.markVisited(key, visited);

    const moved = await this.tryMoveToCell(current);

    if (!moved) {
      return;
    }

    this.logExplorationStep(current, path.length);

    const neighbors = await this.getDiscoverableNeighbors();

    if (!neighbors) {
      return;
    }

    await this.exploreNeighbors(current, neighbors, path, visited, allPaths);
  }

  /**
   * Retourne la dernière cellule du chemin actuel, qui est la position courante.
   * @param path - Chemin parcouru jusqu’ici
   */
  private getCurrentCellFromPath(path: CellCoordinates[]): CellCoordinates {
    return path[path.length - 1];
  }

  /**
   * Génère une clé de coordonnée sous forme de string (ex: "2,3").
   * Utile pour les ensembles de positions visitées.
   * @param pos - Coordonnées (x, y) d'une cellule
   */
  private coordKey(pos: CellCoordinates): string {
    return `${pos.x},${pos.y}`;
  }

  /**
   * Vérifie si une cellule a déjà été visitée.
   * @param key - Clé de coordonnée "x,y"
   * @param visited - Set contenant toutes les positions déjà explorées
   */
  private isVisited(key: string, visited: Set<string>): boolean {
    return visited.has(key);
  }

  /**
   * Marque une cellule comme visitée.
   * @param key - Clé de coordonnée "x,y"
   * @param visited - Set des positions déjà visitées
   */
  private markVisited(key: string, visited: Set<string>): void {
    visited.add(key);
  }

  /**
   * Tente un déplacement vers une cellule via l'API.
   * En cas d'échec, logue l'erreur et retourne false.
   * @param cell - Coordonnées vers lesquelles se déplacer
   * @returns true si le déplacement a réussi, false sinon
   */
  private async tryMoveToCell(cell: CellCoordinates): Promise<boolean> {
    try {
      await this.moveToCell(cell);
      return true;
    } catch (err) {
      this.addLog(`Erreur déplacement vers (${cell.x}, ${cell.y}) : ${err}`);
      return false;
    }
  }

  /**
   * Ajoute un log indiquant l’étape d’exploration actuelle.
   * @param cell - Coordonnées actuelles
   * @param step - Index/longueur du chemin parcouru
   */
  private logExplorationStep(cell: CellCoordinates, step: number): void {
    this.addLog(`Exploration (${step}) : (${cell.x}, ${cell.y})`);
  }

  /**
   * Récupère les cellules voisines accessibles via l'API.
   * En cas d’échec, retourne null.
   * @returns Tableau de cellules voisines, ou null en cas d’erreur
   */
  private async getDiscoverableNeighbors(): Promise<Cell[] | null> {
    try {
      return await this.discoverSurroundings();
    } catch {
      return null;
    }
  }

  /**
   * Parcourt toutes les cellules voisines pour décider si elles doivent être explorées.
   * Délègue à la méthode `handleCellExploration` pour chaque cellule.
   * @param current - Position actuelle
   * @param neighbors - Liste des cellules voisines
   * @param path - Chemin parcouru jusqu’ici
   * @param visited - Set des positions visitées
   * @param allPaths - Chemins sûrs menant à une sortie ('stop')
   */
  private async exploreNeighbors(
    current: CellCoordinates,
    neighbors: Cell[],
    path: CellCoordinates[],
    visited: Set<string>,
    allPaths: { path: CellCoordinates[]; length: number }[]
  ): Promise<void> {
    for (const cell of neighbors) {
      await this.handleCellExploration(current, cell, path, visited, allPaths);
    }
  }

  /**
   * Gère l'exploration d'une cellule voisine si elle est valide et sûre.
   * @param current - Position actuelle dans le labyrinthe
   * @param cell - Cellule voisine candidate à l'exploration
   * @param path - Chemin déjà parcouru
   * @param visited - Coordonnées déjà explorées pour éviter les cycles
   * @param allPaths - Liste cumulée de tous les chemins sûrs jusqu'à une sortie
   */
  private async handleCellExploration(
    current: CellCoordinates,
    cell: Cell,
    path: CellCoordinates[],
    visited: Set<string>,
    allPaths: { path: CellCoordinates[]; length: number }[]
  ): Promise<void> {
    const nextKey = this.coordKey(cell);

    if (!this.canExploreCell(cell, nextKey, visited)) {
      return;
    }

    const nextPath = this.buildNextPath(path, cell);

    if (this.isGoalCell(cell)) {
      this.recordExitPath(nextPath, allPaths);
      return;
    }

    await this.exploreFromCell(nextPath, visited, allPaths);
    await this.returnToPrevious(current);
  }

  /**
   * Détermine si une cellule est accessible et non dangereuse.
   * @param cell - Cellule à tester
   * @param key - Clé "x,y" de la cellule
   * @param visited - Set des positions déjà visitées
   */
  private canExploreCell(
    cell: Cell,
    key: string,
    visited: Set<string>
  ): boolean {
    return !visited.has(key) && cell.move && cell.value !== CELL_TYPE.trap;
  }

  /**
   * Construit un nouveau chemin en ajoutant la cellule donnée à la fin du chemin courant.
   * @param path - Chemin courant
   * @param cell - Cellule à ajouter
   */
  private buildNextPath(
    path: CellCoordinates[],
    cell: Cell
  ): CellCoordinates[] {
    return [...path, { x: cell.x, y: cell.y }];
  }

  /**
   * Vérifie si une cellule est une sortie ('stop').
   * @param cell - Cellule à tester
   */
  private isGoalCell(cell: Cell): boolean {
    return cell.value === CELL_TYPE.stop;
  }

  /**
   * Enregistre un chemin valide menant à une sortie dans la liste des résultats.
   * @param path - Chemin menant à la sortie
   * @param allPaths - Liste des chemins valides
   */
  private recordExitPath(
    path: CellCoordinates[],
    allPaths: { path: CellCoordinates[]; length: number }[]
  ): void {
    allPaths.push({ path, length: path.length });
    this.addLog(`Sortie trouvée en ${path.length} étapes.`);
  }

  /**
   * Retour arrière vers une cellule après exploration.
   * @param cell - Coordonnées de la cellule à rejoindre
   */
  private async returnToPrevious(cell: CellCoordinates): Promise<void> {
    try {
      await this.moveToCell(cell);
      this.addLog(`Retour vers (${cell.x}, ${cell.y}) après impasse.`);
    } catch (err) {
      this.addLog(`Erreur retour arrière vers (${cell.x}, ${cell.y}) : ${err}`);
    }
  }

  /**
   * Affiche le résumé de tous les chemins trouvés, et identifie le plus court.
   * @param allPaths - Liste des chemins parcourus avec leur taille
   */
  private logPaths(
    allPaths: { path: CellCoordinates[]; length: number }[]
  ): void {
    allPaths.sort((a, b) => a.length - b.length);

    this.addLog(`Résumé des chemins vers la sortie`);
    allPaths.forEach((res, i) =>
      this.addLog(`Chemin ${i + 1} : ${res.length} cases.`)
    );

    const shortest = allPaths[0];
    this.addLog(`Chemin le plus court : ${shortest.length} cases.`);
  }

  /**
   * Mise à jour des informations du joueur et gestion des positions déjà visitées
   * @param data Données renvoyées par l’API après un mouvement
   * @param resetVisited boolean
   */
  private updateGameState(data: ApiResponse, resetVisited: boolean): void {
    this._position.set({ x: data.position_x, y: data.position_y });
    this._isDead.set(data.dead);
    this._isWin.set(data.win);
    this._moveUrl.set(data.url_move);
    this._discoverUrl.set(data.url_discover);

    const coordKey = `${data.position_x},${data.position_y}`;

    if (resetVisited) {
      this._visited.set(new Set([coordKey]));
      return;
    }

    this._visited.update((visited) => visited.add(coordKey));
  }

  /**
   * Met à jour l’état du jeu après un déplacement.
   * Conserve l’historique des cases déjà visitées.
   * @param data Données renvoyées par l’API après un mouvement
   */
  private updateFromMove(data: ApiResponse): void {
    this.updateGameState(data, false);
  }

  /**
   * Ajout des cellules découvertes à la carte globale.
   * @param cells Cell
   */
  private discoverCells(cells: Cell[]): void {
    const newMap = new Map(this._map());

    for (const cell of cells) {
      newMap.set(`${cell.x},${cell.y}`, cell);
    }

    this._map.set(newMap);
  }

  /**
   * Sauvegarde de l'historique d'exploration.
   * @param entry string
   */
  private addLog(entry: string): void {
    this._log.set([...this._log(), entry]);
  }

  /**
   * Etapes d'eploration automatique : découvre, choisit et bouge dans une cellule sûre.
   */
  private async exploreNext(): Promise<void> {
    // on ne va pas plus loin si la partie est terminée ou que le déplacment est en cours
    if (this._isWin() || this._isDead() || this.isExploringNow) {
      return;
    }

    try {
      // découverte des cellules et mise à jour de la carte
      const cells = await this.discoverSurroundings();

      // on se déplace en évitant les pièges et les cellules déjà visitées
      const next = this.chooseNextMove(cells);

      // s'il n'existe pas de cellule, on arrête l'exploration
      if (!next) {
        return this.finishExploration(
          'Exploration terminée : aucun chemin sûr trouvé.'
        );
      }

      // on se déplace dans la cellule suivante et on sauvegarde le mouvement
      await this.safeMoveTo(next);
      this.addLog(`Déplacement vers (${next.x}, ${next.y})`);
    } catch (err) {
      this.finishExploration(
        "Erreur pendant l'exploration : " + JSON.stringify(err)
      );
    }
  }

  /**
   * Appel vers l'API avec un timeout de 3 segondes pour découvrir les cellules autour de la position actuelle.
   * @returns Promise<Cell[]>
   */
  private async discoverSurroundings(): Promise<Cell[]> {
    try {
      // appel API et transformation en promesse (firstValueFrom)
      const cells = await firstValueFrom(
        this.mazeService.discover(this._discoverUrl()).pipe(timeout(3000))
      );

      // mise à jour de la carte
      this.discoverCells(cells);
      return cells;
    } catch (err) {
      this.addLog('Erreur lors de la découverte : ' + err);
      throw err;
    }
  }

  /**
   * Sélection d'une cellule vers laquelle se déplacer en évitant les pièges et les cellules déjà visitées.
   * @param cells
   * @returns Cell | undefined
   */
  private chooseNextMove(cells: Cell[]): Cell | undefined {
    return cells.find(
      (cell) =>
        cell.move &&
        cell.value !== CELL_TYPE.trap &&
        !this._visited().has(`${cell.x},${cell.y}`)
    );
  }

  /**
   * Sélection d'une cellule vers laquelle se déplacer en évitant les pièges et les cellules déjà visitées.
   * @param cells
   */
  private async safeMoveTo(cell: Cell): Promise<void> {
    try {
      await this.moveTo(cell);
    } catch (err) {
      this.addLog(
        `Erreur lors du déplacement vers (${cell.x}, ${cell.y}) : ${err}`
      );
    }
  }

  /**
   * Déplacement vers une celulle donnée.
   * @param cell
   */
  private async moveTo(cell: Cell): Promise<void> {
    const result = await firstValueFrom(
      this.mazeService.move(this._moveUrl(), cell.x, cell.y).pipe(timeout(3000))
    );

    this.updateFromMove(result);
  }

  /**
   * Enregistrement de la fin de l'exploration.
   * @param message string
   */
  private finishExploration(message: string): void {
    this._isExploring.set(false);
    this.addLog(message);
  }

  /**
   * Déplacement vers une celulle donnée.
   * @param cell
   * @returns Promise<void>
   */
  private async moveToCell(pos: { x: number; y: number }) {
    try {
      const result = await firstValueFrom(
        this.mazeService.move(this._moveUrl(), pos.x, pos.y).pipe(timeout(3000))
      );

      this.updateFromMove(result);
    } catch (err) {
      this.addLog(`Erreur lors du move vers (${pos.x}, ${pos.y}) : ${err}`);
      throw err;
    }
  }
}
