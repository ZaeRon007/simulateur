package com.api.simulateur.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank(message = "Le nom est obligatoire")
    @Size(max = 100, message = "Le nom doit contenir au maximum 100 caracteres")
    String name,
    @NotBlank(message = "L'email est obligatoire")
    @Email(message = "Format d'email invalide")
    @Size(max = 120, message = "L'email doit contenir au maximum 120 caracteres")
    String email,
    @NotBlank(message = "Le mot de passe est obligatoire")
    @Size(min = 8, max = 72, message = "Le mot de passe doit contenir entre 8 et 72 caracteres")
    String password
) {
}
