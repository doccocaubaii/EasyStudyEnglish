import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GoogleSheetsService } from '../../../../core/services/google-sheets.service';
import { StorageService } from '../../../../core/services/storage.service';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './config.component.html',
  styleUrl: './config.component.scss'
})
export class ConfigComponent {
  users: string[] = [];
  selectedUser: string = '';
  newUserName: string = '';
  loading = false;
  serverStatus: any = null;

  constructor(
    public sheetsService: GoogleSheetsService,
    private storage: StorageService
  ) {}

  async ngOnInit() {
    this.selectedUser = this.sheetsService.currentSheet();
    await this.loadUsers();
  }

  async loadUsers() {
    this.loading = true;
    try {
      this.users = await this.sheetsService.getUsers();
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      this.loading = false;
    }
  }

  async saveSettings() {
    this.loading = true;
    try {
      this.sheetsService.currentSheet.set(this.selectedUser);
      await this.storage.saveSettings({ currentSheet: this.selectedUser });
      alert('Cấu hình đã được lưu thành công!');
    } catch (err) {
      alert('Lưu thất bại!');
    } finally {
      this.loading = false;
    }
  }

  async addNewUser() {
    if (!this.newUserName) return;
    this.loading = true;
    try {
      const result = await this.sheetsService.createUser(this.newUserName);
      if (result === 'User Created') {
        alert('Đã tạo User mới: ' + this.newUserName);
        this.newUserName = '';
        await this.loadUsers();
      } else {
        alert(result);
      }
    } catch (err) {
      alert('Lỗi tạo user!');
    } finally {
      this.loading = false;
    }
  }

  async checkServerVersion() {
    this.loading = true;
    try {
      this.serverStatus = await this.sheetsService.checkVersion();
      alert(`Kết nối thành công! Phiên bản: ${this.serverStatus.version}`);
    } catch (err) {
      alert('Kết nối thất bại! Hãy kiểm tra cài đặt Script trên Google.');
      this.serverStatus = { status: 'Disconnected' };
    } finally {
      this.loading = false;
    }
  }
}
