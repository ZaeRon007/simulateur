package com.api.simulateur.model.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
    @NotBlank(message = "L'email ou le nom d'utilisateur est obligatoire")
    String identifier,
    @NotBlank(message = "Le mot de passe est obligatoire")
    String password
) {
}
