
import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(private toastr: ToastrService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      catchError(error => {
        let errorMessage = 'An error occurred';
        
        if (error.error) {
          if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else if (error.error.detail) {
            errorMessage = error.error.detail;
          } else if (error.error.message) {
            errorMessage = error.error.message;
          } else if (error.error.non_field_errors) {
            errorMessage = error.error.non_field_errors[0];
          }
        }

        if (error.status !== 401 && error.status !== 403) {
          this.toastr.error(errorMessage, 'Error', {
            timeOut: 5000,
            positionClass: 'toast-top-center'
          });
        }

        return throwError(() => error);
      })
    );
  }
}