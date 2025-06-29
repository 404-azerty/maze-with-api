import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/_index';
import { ApiResponse, Cell } from '../interfaces/_index';

@Injectable({ providedIn: 'root' })
export class MazeService {
  private readonly http = inject(HttpClient);

  public startGame(player: string): Observable<ApiResponse> {
    const params = new HttpParams().set('player', player);
    return this.http.post<any>(`${environment.apiUrl}/start-game/`, params);
  }

  public discover(url: string): Observable<Cell[]> {
    return this.http.get<Cell[]>(url);
  }

  public move(url: string, x: number, y: number): Observable<any> {
    const params = new HttpParams().set('position_x', x).set('position_y', y);

    return this.http.post<any>(url, params);
  }
}
