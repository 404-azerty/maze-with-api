import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  templateUrl: './player.dialog.html',
})
export class PlayerDialog {
  public readonly dialogRef = inject(MatDialogRef<PlayerDialog>);
  private readonly formBuilder = inject(FormBuilder);

  public readonly form = this.buildForm();

  public onStartGame() {
    if (this.form.invalid) {
      return;
    }

    this.dialogRef.close(this.form.getRawValue());
  }

  private buildForm(): FormGroup {
    return this.formBuilder.group({
      playerName: [
        null,
        [
          Validators.maxLength(255),
          Validators.minLength(1),
          Validators.required,
        ],
      ],
    });
  }
}
