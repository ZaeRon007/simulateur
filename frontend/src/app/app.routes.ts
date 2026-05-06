import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { unauthGuard } from './core/unauth.guard';

export const routes: Routes = [
	{
		path: '',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/landing-page/landing-page.component').then((m) => m.LandingPageComponent)
	},
	{
		path: 'auth',
		canActivate: [authGuard],
		loadComponent: () => import('./pages/auth/auth.component').then((m) => m.AuthComponent)
	},
	{
		path: 'login',
		canActivate: [authGuard],
		loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent)
	},
	{
		path: 'register',
		canActivate: [authGuard],
		loadComponent: () => import('./pages/register/register.component').then((m) => m.RegisterComponent)
	},
	{
		path: 'profile',
		canActivate: [unauthGuard],
		loadComponent: () =>
			import('./pages/user-profile/user-profile.component').then((m) => m.UserProfileComponent)
	},
	{
		path: 'game',
		canActivate: [unauthGuard],
		loadComponent: () => import('./pages/game/game.component').then((m) => m.GameComponent)
	},
	{
		path: '**',
		redirectTo: ''
	}
];
