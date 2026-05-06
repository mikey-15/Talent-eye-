
import { Component, OnInit, OnDestroy, HostListener, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

interface Counter {
  element: string;
  target: number;
  current: number;
  increment: number;
  animated?: boolean;
}

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class Home implements OnInit, OnDestroy, AfterViewInit {
  isAuthenticated = false;
  scrolled = false;
  private authSubscription?: Subscription;
  private observer?: IntersectionObserver;
  private countersAnimated = false;

  // Counter animation for stats
  counters: Counter[] = [
    { element: 'counter-metrics', target: 6, current: 0, increment: 1 },
    { element: 'counter-processing', target: 24, current: 0, increment: 1 },
    { element: 'counter-objective', target: 100, current: 0, increment: 2 },
    { element: 'counter-cost', target: 0, current: 0, increment: 0 }
  ];

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      this.isAuthenticated = !!user;
    });
  }

  ngAfterViewInit(): void {
    this.setupAnimations();
  }

  ngOnDestroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.scrolled = window.scrollY > 100;
    
    // Trigger counter animations when stats section is in view
    const statsSection = document.querySelector('.stats-section');
    if (statsSection && !this.countersAnimated) {
      const rect = statsSection.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
      
      if (isVisible) {
        this.animateCounters();
        this.countersAnimated = true;
      }
    }

    // Update scroll progress indicator
    this.updateScrollProgress();
  }

  navigateToDashboard(): void {
    if (this.isAuthenticated) {
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  private setupAnimations(): void {
    this.observeElements();
  }

  private observeElements(): void {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          
          if (entry.target.classList.contains('feature-card')) {
            // Stagger animation for feature cards
            setTimeout(() => {
              entry.target.classList.add('animate-feature');
            }, 100);
          }
        }
      });
    }, { threshold: 0.1 });

    // Observe elements for animation
    const elements = document.querySelectorAll('.feature-card, .stat-card, .cta-card, .animate-on-scroll');
    elements.forEach(el => {
      if (this.observer) {
        this.observer.observe(el);
      }
    });
  }

  private animateCounters(): void {
    this.counters.forEach(counter => {
      if (counter.increment > 0 && !counter.animated) {
        counter.animated = true;
        const interval = setInterval(() => {
          counter.current += counter.increment;
          if (counter.current >= counter.target) {
            counter.current = counter.target;
            clearInterval(interval);
          }
          this.updateCounterDisplay(counter.element, counter.current);
        }, 50);
      }
    });
  }

  private updateCounterDisplay(elementId: string, value: number): void {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value.toString();
    }
  }

  private updateScrollProgress(): void {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    
    const progressBar = document.querySelector('.scroll-progress') as HTMLElement;
    if (progressBar) {
      progressBar.style.width = scrolled + '%';
    }
  }
}