import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./pages/landing-page/landing-page.component').then((m) => m.LandingPageComponent)
	},
	{
		path: 'auth',
		loadComponent: () => import('./pages/auth/auth.component').then((m) => m.AuthComponent)
	},
	{
		path: 'login',
		loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent)
	},
	{
		path: 'register',
		loadComponent: () => import('./pages/register/register.component').then((m) => m.RegisterComponent)
	},
	{
		path: 'profile',
		canActivate: [authGuard],
		loadComponent: () =>
			import('./pages/user-profile/user-profile.component').then((m) => m.UserProfileComponent)
	},
	{
		path: 'game',
		loadComponent: () => import('./pages/game/game.component').then((m) => m.GameComponent)
	},
	{
		path: '**',
		redirectTo: ''
	}
];
