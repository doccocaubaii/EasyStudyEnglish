import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StorageService } from './storage.service';

/**
 * Interface chuẩn dùng trong toàn ứng dụng
 */
export interface WordModel {
  row: number;
  id: string | number;
  wordE: string;
  pronunciation: string;
  meaning: string;
  definition: string;
  learnTime: string;
  learnCount: number;
  audioUrl: string;
  example: string;
  isDeleted: boolean;
  backgroundColor?: string;
  apiStatus?: 'success' | 'failed' | 'pending';

  // Hệ thống SRS
  easinessFactor: number;
  intervalDays: number;
  repetitionStreak: number;
  nextReviewDate: string;

  raw: any;
  dictionaryData?: {
    definition?: string;
    audioUrl?: string;
    partOfSpeech?: string;
    phonetic?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class GoogleSheetsService {
  private readonly SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxXFyzzkVGLEXTi9824tfLA_mwhhBB06NK9miPQRo9y_4ybE7fy8or0Nvr-6797oTjeVw/exec';

  loading = signal(false);
  currentSheet = signal('User_Default');
  cachedWords: WordModel[] = [];

  private initPromise: Promise<void>;

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    this.initPromise = this.loadSettings();
  }

  async ensureInitialized() {
    return this.initPromise;
  }

  async loadSettings() {
    const settings = await this.storage.getSettings();
    if (settings.currentSheet) {
      this.currentSheet.set(settings.currentSheet);
    }
  }

  private mapRawToModel(raw: any): WordModel {
    return {
      row: raw.row,
      id: raw['id'] || raw['ID'] || raw['STT'] || '',
      wordE: raw['word'] || raw['Từ mới'] || '',
      pronunciation: raw['phonetic'] || raw['Phiên âm'] || '',
      meaning: raw['meaning'] || raw['Nghĩa'] || '',
      definition: raw['definition'] || raw['Định nghĩa'] || raw['Note'] || '',
      learnTime: raw['learn_time'] || raw['Thời gian học'] || '',
      learnCount: parseInt(raw['learn_count'] || raw['Số lần học']) || 0,
      audioUrl: raw['audio_url'] || raw['Audio URL'] || '',
      example: raw['example'] || raw['Ví dụ'] || raw['Ghi chú'] || raw['Example'] || '',
      isDeleted: raw['deleted'] === 'TRUE' || raw['deleted'] === true || raw['Deleted'] === 'TRUE' || raw['Đã xóa'] === 'TRUE',
      backgroundColor: raw.backgroundColor || '#ffffff',

      easinessFactor: parseFloat(raw['easiness_factor'] || raw['Hệ số dễ (EF)']) || 2.5,
      intervalDays: parseInt(raw['interval_days'] || raw['Khoảng cách (Ngày)']) || 0,
      repetitionStreak: parseInt(raw['repetition_streak'] || raw['Chuỗi nhớ']) || 0,
      nextReviewDate: raw['next_review_date'] || raw['Ngày ôn tiếp theo'] || '',

      raw: raw
    };
  }

  async getWords(forceRefresh: boolean = false): Promise<WordModel[]> {
    await this.ensureInitialized();
    if (!forceRefresh && this.cachedWords.length > 0) {
      return this.cachedWords;
    }
    return await this.syncWithSheet();
  }

  async syncWithSheet(): Promise<WordModel[]> {
    this.loading.set(true);
    const url = `${this.SCRIPT_URL}?sheet=${this.currentSheet()}`;

    try {
      let rawData: any[] = [];
      const electronAPI = (window as any).electronAPI;

      if (electronAPI) {
        rawData = await electronAPI.httpGet(url);
      } else {
        const response = this.http.get<any[]>(url);
        rawData = await firstValueFrom(response);
      }

      const validRawData = (rawData || []).filter(item => {
        const word = item['word'] || item['Từ mới'] || '';
        return word.toString().trim() !== '';
      });

      const mapped = validRawData.map(item => this.mapRawToModel(item));
      this.cachedWords = mapped;
      return mapped;
    } catch (error) {
      console.error('Lỗi đồng bộ dữ liệu:', error);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async cleanupBlankRows(): Promise<void> {
    this.loading.set(true);
    try {
      const url = `${this.SCRIPT_URL}?sheet=${this.currentSheet()}`;
      let rawData: any[] = [];
      const electronAPI = (window as any).electronAPI;

      if (electronAPI) {
        rawData = await electronAPI.httpGet(url);
      } else {
        const response = this.http.get<any[]>(url);
        rawData = await firstValueFrom(response);
      }

      const blankRows = (rawData || [])
        .filter(item => {
          const word = item['word'] || item['Từ mới'] || '';
          return word.toString().trim() === '';
        })
        .map(item => item.row);

      if (blankRows.length > 0) {
        for (const row of blankRows.reverse()) {
          const payload = { action: 'deleteRow', sheet: this.currentSheet(), row: row };
          if (electronAPI) {
            await electronAPI.httpPost(this.SCRIPT_URL, payload);
          } else {
            await firstValueFrom(this.http.post(this.SCRIPT_URL, JSON.stringify(payload), {
              responseType: 'text',
              headers: { 'Content-Type': 'text/plain' }
            }));
          }
        }
        await this.syncWithSheet();
      }
    } catch (error) {
      console.error('Lỗi khi dọn dẹp dòng trắng:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async addWord(word: Partial<WordModel>): Promise<string> {
    this.loading.set(true);
    try {
      const maxId = this.cachedWords.reduce((max, w) => {
        const id = parseInt(w.id as any) || 0;
        return id > max ? id : max;
      }, 0);
      const newId = maxId + 1;
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toLocaleString();

      const dataToSave = [
        newId, now, word.wordE || '', word.pronunciation || '',
        word.meaning || '', word.definition || '', 0, word.audioUrl || '',
        word.example || '', 'FALSE', 2.5, 0, 0, today
      ];

      const color = this.getMemorizationColor({ learnCount: 0, repetitionStreak: 0 } as any, true);

      // Cập nhật Cache cục bộ ngay lập tức
      const newWordModel: WordModel = {
        row: this.cachedWords.length + 2, // Dự đoán dòng
        id: newId,
        wordE: word.wordE || '',
        pronunciation: word.pronunciation || '',
        meaning: word.meaning || '',
        definition: word.definition || '',
        learnTime: now,
        learnCount: 0,
        audioUrl: word.audioUrl || '',
        example: word.example || '',
        isDeleted: false,
        backgroundColor: '#ffffff', // App luôn hiện nền trắng
        easinessFactor: 2.5,
        intervalDays: 0,
        repetitionStreak: 0,
        nextReviewDate: today,
        raw: {}
      };
      this.cachedWords = [...this.cachedWords, newWordModel];

      const payload = {
        action: 'add',
        sheet: this.currentSheet(),
        data: dataToSave,
        color: color
      };

      const electronAPI = (window as any).electronAPI;
      if (electronAPI) {
        return await electronAPI.httpPost(this.SCRIPT_URL, payload);
      } else {
        const response = this.http.post(this.SCRIPT_URL, JSON.stringify(payload), {
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain' }
        });
        return await firstValueFrom(response);
      }
    } catch (error) {
      console.error('Lỗi khi thêm từ mới:', error);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async updateWord(row: number, data: any[]): Promise<string> {
    this.loading.set(true);
    try {
      const mockWord = { learnCount: data[6], repetitionStreak: data[12] } as WordModel;
      const color = this.getMemorizationColor(mockWord, true);

      // Cập nhật Cache cục bộ ngay lập tức để UI đổi màu
      const index = this.cachedWords.findIndex(w => w.row === row);
      if (index !== -1) {
        const updatedWord = this.mapRawToModel({
          row: row,
          id: data[0],
          learn_time: data[1],
          word: data[2],
          phonetic: data[3],
          meaning: data[4],
          definition: data[5],
          learn_count: data[6],
          audio_url: data[7],
          example: data[8],
          deleted: data[9],
          easiness_factor: data[10],
          interval_days: data[11],
          repetition_streak: data[12],
          next_review_date: data[13],
          backgroundColor: '#ffffff' // UI luôn trắng theo yêu cầu
        });
        this.cachedWords[index] = updatedWord;
      }

      const payload = {
        action: 'update',
        sheet: this.currentSheet(),
        row,
        data,
        color: color
      };

      const electronAPI = (window as any).electronAPI;
      let result: string;

      if (electronAPI) {
        result = await electronAPI.httpPost(this.SCRIPT_URL, payload);
      } else {
        const response = this.http.post(this.SCRIPT_URL, JSON.stringify(payload), {
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain' }
        });
        result = await firstValueFrom(response);
      }

      return result;
    } catch (error) {
      console.error('Lỗi cập nhật:', error);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async deleteWord(word: WordModel): Promise<void> {
    const dataToSave = [
      word.id, word.learnTime, word.wordE, word.pronunciation, word.meaning,
      word.definition, word.learnCount, word.audioUrl, word.example, 'TRUE',
      word.easinessFactor, word.intervalDays, word.repetitionStreak, word.nextReviewDate
    ];
    await this.updateWord(word.row, dataToSave);
  }

  processSRSReview(isCorrect: boolean, word: WordModel) {
    const grade = isCorrect ? 4 : 0;
    let ef = word.easinessFactor || 2.5;
    let interval = word.intervalDays || 0;
    let rep = word.repetitionStreak || 0;

    if (grade >= 3) {
      if (rep === 0) interval = 1;
      else if (rep === 1) interval = 6;
      else interval = Math.round(interval * ef);
      rep += 1;
    } else {
      rep = 0;
      interval = 1;
    }

    ef = ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (ef < 1.3) ef = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    return {
      easinessFactor: Number(ef.toFixed(2)),
      intervalDays: interval,
      repetitionStreak: rep,
      nextReviewDate: nextDate.toISOString().split('T')[0]
    };
  }

  async updateSRSResult(word: WordModel, isCorrect: boolean): Promise<any> {
    const newData = this.processSRSReview(isCorrect, word);
    const dataToSave = [
      word.id, word.learnTime || new Date().toLocaleString(), word.wordE, word.pronunciation,
      word.meaning, word.definition, word.learnCount + 1, word.audioUrl, word.example,
      word.isDeleted ? 'TRUE' : 'FALSE', newData.easinessFactor, newData.intervalDays,
      newData.repetitionStreak, newData.nextReviewDate
    ];
    return await this.updateWord(word.row, dataToSave);
  }

  getNewWords(limit: number): WordModel[] {
    return this.cachedWords
      .filter(w => !w.isDeleted && (w.learnCount === 0 || !w.learnCount))
      .slice(0, limit);
  }

  async markAsLearned(words: WordModel[]): Promise<void> {
    for (const word of words) {
      const dataToSave = [
        word.id, word.learnTime || new Date().toLocaleString(), word.wordE, word.pronunciation,
        word.meaning, word.definition, 1, word.audioUrl, word.example, 'FALSE',
        2.5, 1, 1, new Date(Date.now() + 86400000).toISOString().split('T')[0]
      ];
      await this.updateWord(word.row, dataToSave);
    }
  }

  async getUsers(): Promise<string[]> {
    const url = `${this.SCRIPT_URL}?action=getUsers`;
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI) {
        return await electronAPI.httpGet(url);
      } else {
        const response = this.http.get<string[]>(url);
        return await firstValueFrom(response);
      }
    } catch (error) {
      console.error('Lỗi lấy danh sách user:', error);
      return [];
    }
  }

  async createUser(userName: string): Promise<string> {
    this.loading.set(true);
    try {
      const payload = { action: 'createUser', userName: userName };
      const electronAPI = (window as any).electronAPI;

      if (electronAPI) {
        return await electronAPI.httpPost(this.SCRIPT_URL, payload);
      } else {
        const response = this.http.post(this.SCRIPT_URL, JSON.stringify(payload), {
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain' }
        });
        return await firstValueFrom(response);
      }
    } catch (error) {
      console.error('Lỗi tạo user:', error);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async checkVersion(): Promise<any> {
    const payload = { action: 'getVersion' };
    try {
      const electronAPI = (window as any).electronAPI;
      let result: string;
      if (electronAPI) {
        result = await electronAPI.httpPost(this.SCRIPT_URL, payload);
      } else {
        const response = this.http.post(this.SCRIPT_URL, JSON.stringify(payload), {
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain' }
        });
        result = await firstValueFrom(response);
      }
      
      // Đảm bảo bóc tách đúng JSON kể cả khi Google trả về chuỗi lạ
      try {
        return JSON.parse(result);
      } catch {
        // Nếu không phải JSON, thử trích xuất JSON từ chuỗi (đề phòng Google Redirect)
        const jsonMatch = result.match(/\{.*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        throw new Error('Invalid JSON response');
      }
    } catch (error) {
      console.error('Lỗi kiểm tra version:', error);
      throw error;
    }
  }

  getMemorizationColor(word: WordModel, forExcel: boolean = false): string {
    const streak = word.repetitionStreak || 0;
    const learnCount = word.learnCount || 0;

    // 1. CHƯA HỌC BAO GIỜ (learnCount = 0) -> Luôn là màu trắng
    if (learnCount === 0) return '#ffffff';

    // 2. ĐÃ HỌC NHƯNG QUÊN (learnCount > 0 và streak = 0) -> Màu Đỏ
    if (streak === 0) return '#ff0000';

    // 3. CÁC MỨC ĐỘ CÒN LẠI
    if (streak <= 1) return '#ff9900';      // Cam
    if (streak <= 2) return '#ffff00';      // Vàng
    if (streak <= 4) return '#00ffff';      // Xanh dương
    return '#00ff00';                       // Xanh lá
  }

  getMemorizationClass(word: WordModel): string {
    const streak = word.repetitionStreak || 0;
    const learnCount = word.learnCount || 0;
    if (learnCount === 0) return 'bg-red-500';
    if (streak <= 1) return 'bg-orange-500';
    if (streak <= 2) return 'bg-yellow-500';
    if (streak <= 4) return 'bg-blue-500';
    return 'bg-emerald-500';
  }
}
