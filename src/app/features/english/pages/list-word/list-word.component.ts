import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GoogleSheetsService, WordModel } from '../../../../core/services/google-sheets.service';
import { DictionaryService } from '../../../../core/services/dictionary.service';

@Component({
  selector: 'app-list-word',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './list-word.component.html',
  styleUrl: './list-word.component.scss'
})
export class ListWordComponent implements OnInit {
  words: WordModel[] = [];

  // Modal state
  showEditModal = false;
  editForm: FormGroup;
  currentEditingRow: WordModel | null = null;
  saving = false;

  // Pagination state
  currentPage = 1;
  pageSize = 50;
  pageSizes = [10, 20, 30, 50, 100];
  jumpToPageInput: string = '';
  protected Math = Math; // Expose Math to template

  get totalPages(): number {
    return Math.ceil((this.words?.length || 0) / this.pageSize);
  }

  get paginatedWords(): WordModel[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.words.slice(start, end);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  goToPage(page: number | string) {
    const pageNum = typeof page === 'string' ? parseInt(page) : page;
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= this.totalPages) {
      this.currentPage = pageNum;
      this.jumpToPageInput = ''; // Reset input
      this.enrichCurrentPage();
    }
  }

  onPageSizeChange(event: Event) {
    const newSize = +(event.target as HTMLSelectElement).value;
    this.pageSize = newSize;
    this.currentPage = 1; // Reset to page 1 when size changes
    this.enrichCurrentPage();
  }

  onJumpToPage(event: any) {
    const page = parseInt(event.target.value);
    if (!isNaN(page)) {
      this.goToPage(page);
    }
  }

  /**
   * Sinh danh sách trang hiển thị mượt mà: 1, 2, ..., 5, 6, 7, ..., 10
   */
  getVisiblePages(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const delta = 2; // Số trang hiển thị quanh trang hiện tại
    const range: (number | string)[] = [];

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      } else if (range[range.length - 1] !== '...') {
        range.push('...');
      }
    }
    return range;
  }

  constructor(
    public sheetsService: GoogleSheetsService,
    private dictionaryService: DictionaryService,
    private fb: FormBuilder
  ) {
    this.editForm = this.fb.group({
      word: ['', Validators.required],
      meaning: ['', Validators.required],
      example: ['']
    });
  }

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.words = await this.sheetsService.getWords();
    this.enrichCurrentPage();
  }

  async syncData() {
    this.words = await this.sheetsService.syncWithSheet();
    this.currentPage = 1;
    this.enrichCurrentPage();
  }

  async deleteWord(word: WordModel) {
    if (confirm(`Bạn có chắc muốn xóa từ "${word.wordE}"?`)) {
      await this.sheetsService.deleteWord(word);
      await this.loadData();
    }
  }

  async enrichCurrentPage() {
    const currentPageWords = this.paginatedWords;
    for (const word of currentPageWords) {
      if (!word.dictionaryData) {
        const data = await this.dictionaryService.getDefinition(word.wordE);
        if (data) {
          const firstMeaning = data.meanings[0];
          word.dictionaryData = {
            definition: firstMeaning?.definitions[0]?.definition,
            partOfSpeech: firstMeaning?.partOfSpeech,
            audioUrl: data.phonetics.find(p => p.audio)?.audio,
            phonetic: data.phonetic
          };
        }
      }
    }
  }

  playAudio(url: string | undefined) {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(err => console.error('Audio play failed:', err));
  }

  openEditModal(word: WordModel) {
    this.currentEditingRow = word;
    this.editForm.patchValue({
      word: word.wordE,
      meaning: word.meaning,
      example: word.example
    });
    this.showEditModal = true;
  }

  closeModal() {
    this.showEditModal = false;
    this.editForm.reset();
    this.currentEditingRow = null;
  }

  async submitEdit() {
    if (this.editForm.invalid || !this.currentEditingRow) return;

    this.saving = true;
    try {
      const { word, meaning, example } = this.editForm.value;

      // Mapping ngược lại khi lưu (Dùng lại Raw để giữ nguyên các cột không sửa)
      // Cột C (Index 2): Từ mới, Cột E (Index 4): Nghĩa, Cột I (Index 8): Ghi chú
      const dataToSave = [
        this.currentEditingRow.raw[' '] || '',
        this.currentEditingRow.raw['Thời gian học'] || '',
        word,
        this.currentEditingRow.raw['Phiên âm'] || '',
        meaning,
        this.currentEditingRow.raw['Note'] || '',
        this.currentEditingRow.raw['Số lần học'] || '',
        this.currentEditingRow.raw[''] || '',
        example
      ];

      await this.sheetsService.updateWord(this.currentEditingRow.row, dataToSave);
      this.closeModal();
      await this.loadData();
    } catch (err) {
      console.error('Update failed:', err);
      alert('Cập nhật thất bại. Vui lòng thử lại.');
    } finally {
      this.saving = false;
    }
  }
}
