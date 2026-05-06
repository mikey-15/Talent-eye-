import { Component, OnInit } from '@angular/core';
import { ClientStorageService, UiSettings } from '../../services/client-storage.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-settings',
  standalone: false,
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  settings: UiSettings = {
    emailTips: true,
    digestWeekly: false,
    reducedMotion: false
  };

  constructor(
    private storage: ClientStorageService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.settings = this.storage.getUiSettings();
  }

  save(): void {
    this.storage.patchUiSettings(this.settings);
    this.toastr.success('Preferences saved on this device.', 'Settings');
  }

  reset(): void {
    this.settings = {
      emailTips: true,
      digestWeekly: false,
      reducedMotion: false
    };
    this.storage.patchUiSettings(this.settings);
    this.toastr.info('Reset to defaults.', 'Settings');
  }
}
