# Stuarc — Developer Guide

## Project Overview
A tutoring mobile app (React Native + Expo) with a Next.js admin panel.
Full spec is in SPEC.md. Read it before doing anything.

## Stack
- Mobile: React Native, Expo SDK 51, TypeScript
- Admin: Next.js 14 App Router, TypeScript
- Backend: Supabase (auth, postgres, no file storage — Drive only)
- State: Zustand
- Offline: expo-sqlite, expo-file-system

## Rules — follow these always
- TypeScript strictly. No `any` types.
- Every new file gets a comment at the top explaining what it does.
- No hardcoded strings. All copy goes in a constants file.
- Use Supabase RLS — never bypass it with service role key on the client.
- Test each feature manually before marking it done.
- Never install a new package without telling me first.

## Folder Structure
/apps/mobile       ← Expo app
/apps/admin        ← Next.js admin panel
/packages/shared   ← shared types, constants, utils

## Current Phase
Phase 1 — see SPEC.md section 14 for what's in scope.