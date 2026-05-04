package com.api.simulateur.model.dto;

public record AuthResponse(
    String accessToken,
    String tokenType,
    long expiresIn
) {
}
