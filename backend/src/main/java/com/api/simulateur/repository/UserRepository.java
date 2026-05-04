package com.api.simulateur.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.api.simulateur.model.User;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByNameIgnoreCase(String name);

    Optional<User> findByEmailIgnoreCaseOrNameIgnoreCase(String email, String name);

    boolean existsByEmail(String email);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByNameIgnoreCase(String name);
}
