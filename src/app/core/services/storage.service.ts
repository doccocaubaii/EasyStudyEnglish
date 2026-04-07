import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private electronAPI = (window as any).electronAPI;

  constructor() {}

  async saveFile(fileName: string, data: any): Promise<boolean> {
    if (this.electronAPI) {
      return await this.electronAPI.saveToFile(fileName, data);
    }
    // Fallback to localStorage
    localStorage.setItem(fileName, JSON.stringify(data));
    return true;
  }

  async readFile(fileName: string): Promise<any> {
    if (this.electronAPI) {
      return await this.electronAPI.readFile(fileName);
    }
    const data = localStorage.getItem(fileName);
    return data ? JSON.parse(data) : null;
  }

  async saveSettings(settings: any): Promise<boolean> {
    if (this.electronAPI) {
      return await this.electronAPI.saveSettings(settings);
    }
    localStorage.setItem('app_settings', JSON.stringify(settings));
    return true;
  }

  async getSettings(): Promise<any> {
    if (this.electronAPI) {
      return await this.electronAPI.getSettings();
    }
    const data = localStorage.getItem('app_settings');
    return data ? JSON.parse(data) : {};
  }
}
