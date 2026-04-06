import { Routes } from '@angular/router';
import { ListWordComponent } from './features/english/pages/list-word/list-word.component';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { ConfigComponent } from './features/english/pages/config/config.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', component: ListWordComponent },
      { path: 'home', component: ListWordComponent },
      { path: 'list-word', component: ListWordComponent },
      { path: 'config', component: ConfigComponent },
    ]
  },
];
