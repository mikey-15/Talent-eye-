import { Pipe, PipeTransform } from '@angular/core';
import { coachFacingTitleFromApiName } from '../utils/metric-labels';

@Pipe({ name: 'coachMetricTitle', standalone: false })
export class CoachMetricTitlePipe implements PipeTransform {
  transform(apiMetricName: string | null | undefined): string {
    if (apiMetricName == null || !String(apiMetricName).trim()) return '—';
    return coachFacingTitleFromApiName(apiMetricName);
  }
}
