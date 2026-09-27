@AGENTS.md
@../CLAUDE.md

# Reglas de Diseño Frontend (BI 0 A 100)

1. **AmbientBackground.tsx y Footer.tsx**:
   - `AmbientBackground.tsx` controla el descenso de órbita (cota 100) a ciudad (cota 0) con rascacielos iluminados, balizas rojas y estrellas sólidas. NUNCA eliminar ni alterar su canvas.
   - `Footer.tsx` DEBE mantenerse `bg-transparent` para que el skyline urbano sea visible.
2. **Auth y Sign Up (`app/auth/signup/page.tsx` y `AuthBackground.tsx`)**:
   - Diseño Studio Dark `#1C1C1E` con explorador interactivo de 4 áreas (`Viabilidad`, `Finanzas`, `Operación`, `Expertos`). Prohibido revertir.
3. **Estilo visual**:
   - Tarjetas `#1C1C1E`, bordes `white/[0.08]`, puntos estelares nítidos, sin orbes de neón ni rectángulos azules.

