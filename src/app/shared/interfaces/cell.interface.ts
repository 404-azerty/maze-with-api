import { CELL_TYPE } from '../enums/_index';

export interface Cell {
  move: boolean;
  value: CELL_TYPE;
  x: number;
  y: number;
}

export interface CellCoordinates {
  x: number;
  y: number;
}
