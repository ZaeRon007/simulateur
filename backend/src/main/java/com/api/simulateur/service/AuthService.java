package com.api.simulateur.service;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.api.simulateur.exception.BadRequestException;
import com.api.simulateur.model.Score;
import com.api.simulateur.model.User;
import com.api.simulateur.model.dto.AuthResponse;
import com.api.simulateur.model.dto.LoginRequest;
import com.api.simulateur.model.dto.RegisterRequest;
import com.api.simulateur.repository.ScoreRepository;
import com.api.simulateur.repository.UserRepository;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final ScoreRepository scoreRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenService jwtTokenService;

    public AuthService(
        UserRepository userRepository,
        ScoreRepository scoreRepository,
        PasswordEncoder passwordEncoder,
        AuthenticationManager authenticationManager,
        JwtTokenService jwtTokenService
    ) {
        this.userRepository = userRepository;
        this.scoreRepository = scoreRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtTokenService = jwtTokenService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase();
        String normalizedName = request.name().trim();

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new BadRequestException("Cet email est deja utilise");
        }

        if (userRepository.existsByNameIgnoreCase(normalizedName)) {
            throw new BadRequestException("Ce nom d'utilisateur est deja utilise");
        }

        User user = new User();
        user.setName(normalizedName);
        user.setEmail(normalizedEmail);
        user.setPassword(passwordEncoder.encode(request.password()));
        User savedUser = userRepository.save(user);

        Score score = new Score();
        score.setUser(savedUser);
        score.setScore(0);
        score.setBestScore(0);
        scoreRepository.save(score);

        String token = jwtTokenService.generateToken(savedUser.getId(), savedUser.getEmail(), savedUser.getName());
        return new AuthResponse(token, "Bearer", jwtTokenService.getExpirationSeconds());
    }

    public AuthResponse login(LoginRequest request) {
        String identifier = request.identifier().trim().toLowerCase();

        try {
            authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(identifier, request.password())
            );
        } catch (BadCredentialsException ex) {
            throw new BadRequestException("Nom ou mot de passe incorrect");
        }

        User user = userRepository.findByEmailIgnoreCaseOrNameIgnoreCase(identifier, identifier)
            .orElseThrow(() -> new BadRequestException("Nom ou mot de passe incorrect"));

        String token = jwtTokenService.generateToken(user.getId(), user.getEmail(), user.getName());
        return new AuthResponse(token, "Bearer", jwtTokenService.getExpirationSeconds());
    }
}
