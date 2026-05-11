package com.api.simulateur.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.api.simulateur.model.dto.ScoreRequest;
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

    @PostMapping("/score")
    public ResponseEntity<Void> submitScore(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody ScoreRequest request) {
        String email = jwt.getSubject();
        userProfileService.saveScore(email, request.reactionTime());
        return ResponseEntity.ok().build();
    }
}
