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
      title: 'Danh sách từ',
      icon: 'fa-solid fa-list-ul',
      link: '/list-word'
    },
    {
      title: 'Học tập',
      icon: 'fa-solid fa-graduation-cap',
      link: '/study'
    },
    {
      title: 'Cài đặt',
      icon: 'fa-solid fa-gears',
      link: '/config'
    }
  ]
}
