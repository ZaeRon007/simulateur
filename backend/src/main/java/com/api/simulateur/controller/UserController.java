package com.api.simulateur.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.api.simulateur.model.dto.UserProfileResponse;
import com.api.simulateur.service.UserProfileService;

@RestController
public class UserController {

    private final UserProfileService userProfileService;

    public UserController(UserProfileService userProfileService) {
        this.userProfileService = userProfileService;
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me(@AuthenticationPrincipal Jwt jwt) {
        String email = jwt.getSubject();
        return ResponseEntity.ok(userProfileService.getProfileByEmail(email));
    }
}
