import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  menuItems = [
    {
      title: 'Home',
      icon: 'home',
      link: '/'
    },
    {
      title: 'List Word',
      icon: 'list',
      link: '/list-word'
    },
    {
      title: 'Config',
      icon: 'config',
      link: '/config'
    }
  ]
}
