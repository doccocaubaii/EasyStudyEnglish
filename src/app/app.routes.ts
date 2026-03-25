import { Routes } from '@angular/router';
import {ListWordComponent} from './features/english/pages/list-word/list-word.component';
import {MainLayoutComponent} from './layouts/main-layout/main-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', component: ListWordComponent }
    ]
  },
];
