"""V4 Unified Field Theory — symbolic research scaffold, version 0.2.

This module preserves the user's original equation and adds explicit symbolic
field-strength construction and Euler–Lagrange checks for representative
Abelian and SU(2) gauge sectors, plus a scalar-field demonstration.

Important scientific boundaries
-------------------------------
* The symbols F, G and W in the supplied equation remain unassigned. The code
  does NOT assert that they correspond to particular Standard Model fields.
* The SU(2) and U(1) sectors below are mathematical test examples, not yet an
  identification of the original V4 fields.
* The gravitational equation is given as the standard equation associated with
  the normalized comparison action. This code does not vary a general metric
  tensor using a complete symbolic differential-geometry engine.
* This is a research scaffold, not a proven or complete unified theory.

Install:
    python -m pip install sympy

Run:
    python v4_theory.py                  # overview, dimensions, scalar EOM
    python v4_theory.py --derive-maxwell # symbolic Maxwell derivation
    python v4_theory.py --derive-su2     # construct SU(2) field strengths/EOM
    python v4_theory.py --all            # run all derivations/checks
    python v4_theory.py --self-test      # run consistency checks
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import sympy as sp

VERSION = "0.2"


# ===========================================================================
# 1. V4 FIELD REGISTRY
# ===========================================================================

@dataclass(frozen=True)
class FieldDefinition:
    symbol: str
    meaning: str
    mass_dimension: sp.Rational
    status: str


FIELD_REGISTRY: Tuple[FieldDefinition, ...] = (
    FieldDefinition("g_mu_nu", "Spacetime metric", sp.Rational(0), "geometry required"),
    FieldDefinition("R", "Ricci scalar / spacetime curvature", sp.Rational(2), "present in original equation"),
    FieldDefinition("F_mu_nu", "Unspecified field-strength tensor", sp.Rational(2), "gauge group and definition required"),
    FieldDefinition("G_mu_nu", "Unspecified field-strength tensor", sp.Rational(2), "gauge group and definition required"),
    FieldDefinition("W_mu_nu", "Unspecified field-strength tensor", sp.Rational(2), "gauge group and definition required"),
    FieldDefinition("psi_i", "Fermion fields", sp.Rational(3, 2), "spinor/gauge representations required"),
    FieldDefinition("H", "Scalar / Higgs-like field", sp.Rational(1), "representation and potential required"),
    FieldDefinition("lambda_ij", "Yukawa-like coupling matrix", sp.Rational(0), "index contractions and field types required"),
)


# ===========================================================================
# 2. ORIGINAL EQUATION FROM THE IMAGE — STRUCTURE PRESERVED
# ===========================================================================

R, F2, G2, W2 = sp.symbols("R F2 G2 W2", real=True)
K_fermion, K_higgs, V_higgs, Y_yukawa = sp.symbols(
    "K_fermion K_higgs V_higgs Y_yukawa", real=True
)

# F2 := F_{mu nu} F^{mu nu}; similarly for G2 and W2.
# K_fermion, K_higgs and the remaining symbols stand for the corresponding
# terms in the supplied equation. This expression intentionally preserves its
# written structure rather than silently normalizing it.
ORIGINAL_LAGRANGIAN_DENSITY = (
    R - F2 - G2 - W2 + K_fermion + K_higgs - V_higgs - Y_yukawa
)


# ===========================================================================
# 3. NORMALIZED COMPARISON BASELINE (NOT A REPLACEMENT FOR ORIGINAL V4)
# ===========================================================================

Mpl, Lambda = sp.symbols("M_Pl Lambda", positive=True, real=True)
B2, W_SM2, G_SM2 = sp.symbols("B2 W_SM2 G_SM2", real=True)
K_fermion_std, K_higgs_std, V_higgs_std, L_yukawa_std = sp.symbols(
    "K_fermion_std K_higgs_std V_higgs_std L_yukawa_std", real=True
)

BASELINE_LAGRANGIAN_DENSITY = (
    (Mpl**2 / 2) * (R - 2 * Lambda)
    - sp.Rational(1, 4) * B2
    - sp.Rational(1, 4) * W_SM2
    - sp.Rational(1, 4) * G_SM2
    + K_fermion_std + K_higgs_std - V_higgs_std - L_yukawa_std
)


# ===========================================================================
# 4. ENGINEERING MASS-DIMENSION AUDIT
# ===========================================================================

# In four spacetime dimensions and hbar=c=1, L has mass dimension 4.
DIMENSION_SYMBOLS: Dict[sp.Symbol, sp.Rational] = {
    R: sp.Rational(2),
    F2: sp.Rational(4), G2: sp.Rational(4), W2: sp.Rational(4),
    K_fermion: sp.Rational(4), K_higgs: sp.Rational(4),
    V_higgs: sp.Rational(4), Y_yukawa: sp.Rational(4),
    Mpl: sp.Rational(1), Lambda: sp.Rational(2),
    B2: sp.Rational(4), W_SM2: sp.Rational(4), G_SM2: sp.Rational(4),
    K_fermion_std: sp.Rational(4), K_higgs_std: sp.Rational(4),
    V_higgs_std: sp.Rational(4), L_yukawa_std: sp.Rational(4),
}


def dimension_of_monomial(expr: sp.Expr) -> Optional[sp.Rational]:
    """Return mass dimension of a monomial; None means unknown/unsupported."""
    expr = sp.sympify(expr)
    if expr.is_Number:
        return sp.Rational(0)
    if expr.is_Symbol:
        return DIMENSION_SYMBOLS.get(expr)
    if expr.is_Mul:
        dims = [dimension_of_monomial(arg) for arg in expr.args]
        if any(dim is None for dim in dims):
            return None
        return sum(dims, sp.Rational(0))
    if expr.is_Pow and expr.exp.is_Number:
        base_dim = dimension_of_monomial(expr.base)
        return None if base_dim is None else base_dim * expr.exp
    return None


def check_term_dimensions(terms: List[Tuple[str, sp.Expr]]) -> List[str]:
    """Report dimensions term-by-term; a density term should have dimension 4."""
    results: List[str] = []
    for label, term in terms:
        dim = dimension_of_monomial(term)
        if dim is None:
            results.append(f"{label}: dimension unknown")
        elif dim != 4:
            results.append(f"{label}: mass dimension {dim}; expected 4")
        else:
            results.append(f"{label}: OK (mass dimension 4)")
    return results


ORIGINAL_TERMS = [
    ("R", R),
    ("-F_mu_nu F^mu_nu", -F2),
    ("-G_mu_nu G^mu_nu", -G2),
    ("-W_mu_nu W^mu_nu", -W2),
    ("fermion kinetic placeholder", K_fermion),
    ("Higgs kinetic placeholder", K_higgs),
    ("-V(H)", -V_higgs),
    ("-Yukawa placeholder", -Y_yukawa),
]

BASELINE_TERMS = [
    ("M_Pl^2 R / 2", Mpl**2 * R / 2),
    ("-M_Pl^2 Lambda", -Mpl**2 * Lambda),
    ("-B_mu_nu B^mu_nu / 4", -B2 / 4),
    ("-W^a_mu_nu W^{a mu nu} / 4", -W_SM2 / 4),
    ("-G^A_mu_nu G^{A mu nu} / 4", -G_SM2 / 4),
    ("fermion kinetic term", K_fermion_std),
    ("Higgs kinetic term", K_higgs_std),
    ("-V(H)", -V_higgs_std),
    ("-Yukawa interaction", -L_yukawa_std),
]


# ===========================================================================
# 5. EULER–LAGRANGE HELPER
# ===========================================================================


def euler_lagrange_density(
    lagrangian: sp.Expr,
    field: sp.Expr,
    coordinates: Tuple[sp.Symbol, ...],
) -> sp.Expr:
    """Return dL/d(field) - d_mu(dL/d(d_mu field)) for a scalar component.

    This helper assumes the field and its derivatives are represented explicitly
    by SymPy expressions. It is not a general tensor/spinor-variation engine.
    """
    result = sp.diff(lagrangian, field)
    for coordinate in coordinates:
        derivative = sp.diff(field, coordinate)
        result -= sp.diff(sp.diff(lagrangian, derivative), coordinate)
    return sp.simplify(result)


# ===========================================================================
# 6. SCALAR FIELD DEMONSTRATION
# ===========================================================================


def scalar_field_demo() -> Tuple[sp.Expr, sp.Expr, sp.Expr]:
    """Derive the real scalar EOM for L = -1/2 (partial h)^2 - V(h).

    Metric signature is (-,+,+,+). This is a one-component real-scalar demo,
    not the full complex Higgs doublet from the source equation.
    """
    t, x, y, z = sp.symbols("t x y z", real=True)
    coords = (t, x, y, z)
    h = sp.Function("h")(*coords)
    m2, lambda_h = sp.symbols("m2 lambda_h", real=True)
    metric = sp.diag(-1, 1, 1, 1)
    derivatives = [sp.diff(h, q) for q in coords]
    kinetic = -sp.Rational(1, 2) * sum(
        metric[i, i] * derivatives[i] ** 2 for i in range(4)
    )
    potential = sp.Rational(1, 2) * m2 * h**2 + sp.Rational(1, 4) * lambda_h * h**4
    lagrangian = kinetic - potential
    eom = euler_lagrange_density(lagrangian, h, coords)
    return lagrangian, potential, sp.factor(eom)


# ===========================================================================
# 7. ABELIAN U(1) TEST SECTOR: BUILD F AND DERIVE MAXWELL EQUATIONS
# ===========================================================================

@dataclass
class MaxwellDerivation:
    coordinates: Tuple[sp.Symbol, ...]
    metric: sp.Matrix
    potential_covariant: Tuple[sp.Expr, ...]
    field_strength_covariant: List[List[sp.Expr]]
    field_strength_contravariant: List[List[sp.Expr]]
    lagrangian_density: sp.Expr
    euler_lagrange_equations: Tuple[sp.Expr, ...]
    field_equations_divergence: Tuple[sp.Expr, ...]
    verified: bool


def derive_maxwell_equations() -> MaxwellDerivation:
    """Construct F_mu_nu = d_mu A_nu - d_nu A_mu and derive its EOM.

    Uses a flat Minkowski metric diag(-1,1,1,1), source-free Maxwell action
    L = -1/4 F_mu_nu F^mu_nu, and SymPy's Euler–Lagrange operator.
    """
    coords = sp.symbols("t x y z", real=True)
    eta = sp.diag(-1, 1, 1, 1)
    A = tuple(sp.Function(f"A_{mu}")(*coords) for mu in range(4))

    F_cov = [
        [sp.diff(A[nu], coords[mu]) - sp.diff(A[mu], coords[nu])
         for nu in range(4)]
        for mu in range(4)
    ]
    F_contra = [[
        sp.simplify(sum(
            eta[mu, a] * eta[nu, b] * F_cov[a][b]
            for a in range(4) for b in range(4)
        ))
        for nu in range(4)] for mu in range(4)
    ]

    lagrangian = sp.simplify(-sp.Rational(1, 4) * sum(
        F_cov[mu][nu] * F_contra[mu][nu]
        for mu in range(4) for nu in range(4)
    ))

    # Vary with respect to each covariant potential component A_nu.
    eoms: List[sp.Expr] = []
    divergences: List[sp.Expr] = []
    for nu in range(4):
        eom = sp.diff(lagrangian, A[nu])
        for mu in range(4):
            eom -= sp.diff(
                sp.diff(lagrangian, sp.diff(A[nu], coords[mu])), coords[mu]
            )
        eoms.append(sp.simplify(eom))
        divergences.append(sp.simplify(sum(
            sp.diff(F_contra[mu][nu], coords[mu]) for mu in range(4)
        )))

    verified = all(
        sp.simplify(eoms[i] - divergences[i]) == 0 for i in range(4)
    )
    return MaxwellDerivation(
        coordinates=coords,
        metric=eta,
        potential_covariant=A,
        field_strength_covariant=F_cov,
        field_strength_contravariant=F_contra,
        lagrangian_density=lagrangian,
        euler_lagrange_equations=tuple(eoms),
        field_equations_divergence=tuple(divergences),
        verified=verified,
    )


def verify_abelian_bianchi_identity(derivation: MaxwellDerivation) -> bool:
    """Verify partial_[lambda F_mu nu] = 0 for the constructed Abelian F."""
    coords = derivation.coordinates
    F = derivation.field_strength_covariant
    for lam in range(4):
        for mu in range(4):
            for nu in range(4):
                identity = (
                    sp.diff(F[mu][nu], coords[lam])
                    + sp.diff(F[nu][lam], coords[mu])
                    + sp.diff(F[lam][mu], coords[nu])
                )
                if sp.simplify(identity) != 0:
                    return False
    return True


# ===========================================================================
# 8. NON-ABELIAN SU(2) TEST SECTOR: FIELD STRENGTH + YANG-MILLS EOM
# ===========================================================================

@dataclass
class YangMillsDerivation:
    coordinates: Tuple[sp.Symbol, ...]
    coupling: sp.Symbol
    gauge_potential: List[List[sp.Expr]]
    field_strength_covariant: List[List[List[sp.Expr]]]
    field_strength_contravariant: List[List[List[sp.Expr]]]
    eom_covariant_divergence: List[List[sp.Expr]]
    antisymmetry_verified: bool


def derive_su2_yang_mills_equations() -> YangMillsDerivation:
    """Build SU(2) field strengths and D_mu F^{a mu nu} symbolically.

    Convention:
      F^a_mu_nu = partial_mu A^a_nu - partial_nu A^a_mu
                   + g epsilon^{abc} A^b_mu A^c_nu
      (D_mu F^{mu nu})^a = partial_mu F^{a mu nu}
                            + g epsilon^{abc} A^b_mu F^{c mu nu}

    This builds the equation's left-hand side in flat spacetime. A matter
    current can be included by equating it to J^{a nu}. This is a separate
    illustrative SU(2) sector; it does not assign the original W tensor.
    """
    coords = sp.symbols("t x y z", real=True)
    eta = sp.diag(-1, 1, 1, 1)
    g = sp.symbols("g_SU2", real=True)
    # Three adjoint/color components, each with four covariant spacetime comps.
    A = [[sp.Function(f"A_color{a}_mu{mu}")(*coords)
          for mu in range(4)] for a in range(3)]

    F_cov = [[[sp.S.Zero for _ in range(4)] for _ in range(4)] for _ in range(3)]
    for a in range(3):
        for mu in range(4):
            for nu in range(4):
                derivative_part = sp.diff(A[a][nu], coords[mu]) - sp.diff(A[a][mu], coords[nu])
                interaction_part = sp.S.Zero
                for b in range(3):
                    for c in range(3):
                        interaction_part += sp.LeviCivita(a, b, c) * A[b][mu] * A[c][nu]
                F_cov[a][mu][nu] = sp.expand(derivative_part + g * interaction_part)

    F_contra = [[[sp.S.Zero for _ in range(4)] for _ in range(4)] for _ in range(3)]
    for a in range(3):
        for mu in range(4):
            for nu in range(4):
                F_contra[a][mu][nu] = sp.expand(sum(
                    eta[mu, rho] * eta[nu, sigma] * F_cov[a][rho][sigma]
                    for rho in range(4) for sigma in range(4)
                ))

    # D_mu F^{a mu nu}; this is the source-free EOM left-hand side.
    eom = [[sp.S.Zero for _ in range(4)] for _ in range(3)]
    for a in range(3):
        for nu in range(4):
            derivative_part = sum(
                sp.diff(F_contra[a][mu][nu], coords[mu]) for mu in range(4)
            )
            interaction_part = sp.S.Zero
            for mu in range(4):
                for b in range(3):
                    for c in range(3):
                        interaction_part += (
                            g * sp.LeviCivita(a, b, c)
                            * A[b][mu] * F_contra[c][mu][nu]
                        )
            eom[a][nu] = sp.factor(derivative_part + interaction_part)

    antisymmetry_verified = all(
        sp.simplify(F_cov[a][mu][nu] + F_cov[a][nu][mu]) == 0
        for a in range(3) for mu in range(4) for nu in range(4)
    )

    return YangMillsDerivation(
        coordinates=coords,
        coupling=g,
        gauge_potential=A,
        field_strength_covariant=F_cov,
        field_strength_contravariant=F_contra,
        eom_covariant_divergence=eom,
        antisymmetry_verified=antisymmetry_verified,
    )


# ===========================================================================
# 9. FORMAL FIELD-EQUATION MAP FOR THE NORMALIZED BASELINE
# ===========================================================================

FORMAL_FIELD_EQUATIONS = {
    "gravity": "G_{mu nu} + Lambda g_{mu nu} = T_{mu nu}/M_Pl^2",
    "abelian_gauge": "nabla_mu F^{mu nu} = J^nu (sign depends on source convention)",
    "nonabelian_gauge": "(D_mu F^{mu nu})^a = J^{a nu}",
    "fermion": "i gamma^mu D_mu psi - (Yukawa/mass terms) = 0",
    "scalar": "D_mu D^mu H + dV/dH^dagger + dL_Yukawa/dH^dagger = 0",
}


# ===========================================================================
# 10. REPORTING AND SELF-TESTS
# ===========================================================================


def print_maxwell_report() -> None:
    result = derive_maxwell_equations()
    print("\nMAXWELL / U(1) SYMBOLIC DERIVATION")
    print("Metric: diag(-1, +1, +1, +1)")
    print("F_{mu nu} = partial_mu A_nu - partial_nu A_mu")
    print("L = -1/4 F_{mu nu} F^{mu nu}")
    print("Euler–Lagrange equations match partial_mu F^{mu nu} = 0:", result.verified)
    print("Bianchi identity partial_[lambda F_mu nu] = 0:", verify_abelian_bianchi_identity(result))
    print("Example component (nu=0):")
    print("  ", sp.pretty(result.euler_lagrange_equations[0]))


def print_su2_report() -> None:
    result = derive_su2_yang_mills_equations()
    print("\nSU(2) / YANG–MILLS SYMBOLIC CONSTRUCTION")
    print("F^a_{mu nu} = partial_mu A^a_nu - partial_nu A^a_mu + g epsilon^{abc} A^b_mu A^c_nu")
    print("D_mu F^{a mu nu} built for 3 color components x 4 spacetime components.")
    print("Field-strength antisymmetry verified:", result.antisymmetry_verified)
    print("Source-free equations are D_mu F^{a mu nu} = 0 (12 component equations).")
    print("Example: color a=1, nu=0 (expression may be long):")
    print("  ", sp.pretty(result.eom_covariant_divergence[0][0]))


def self_test() -> bool:
    """Run sanity checks on the actual symbolic constructions."""
    ok = True

    maxwell = derive_maxwell_equations()
    checks = {
        "Maxwell Euler–Lagrange matches field-strength divergence": maxwell.verified,
        "Abelian Bianchi identity": verify_abelian_bianchi_identity(maxwell),
    }

    scalar_l, scalar_v, scalar_eom = scalar_field_demo()
    checks["Scalar equation includes kinetic and potential contributions"] = (
        scalar_eom != 0 and any(str(symbol) == "lambda_h" for symbol in scalar_v.free_symbols)
    )

    # Explicit checks for expected dimensional mismatch / normalized terms.
    checks["Original curvature term requires dimensionful normalization"] = (
        dimension_of_monomial(R) == 2
    )
    checks["Normalized Einstein-Hilbert term has dimension four"] = (
        dimension_of_monomial(Mpl**2 * R / 2) == 4
    )

    for label, passed in checks.items():
        print(f"{'PASS' if passed else 'FAIL'}: {label}")
        ok = ok and passed

    print("\nSU(2) construction check (may take longer)...")
    su2 = derive_su2_yang_mills_equations()
    print(f"{'PASS' if su2.antisymmetry_verified else 'FAIL'}: SU(2) field-strength antisymmetry")
    ok = ok and su2.antisymmetry_verified
    print("All self-tests passed." if ok else "One or more self-tests failed.")
    return ok


def json_report() -> dict:
    """Lightweight theory snapshot for the live dashboard. Skips the slow SU(2) build."""
    maxwell = derive_maxwell_equations()
    scalar_l, scalar_v, scalar_eom = scalar_field_demo()
    checks = [
        {
            "name": "Maxwell Euler–Lagrange matches field-strength divergence",
            "pass": bool(maxwell.verified),
        },
        {
            "name": "Abelian Bianchi identity",
            "pass": bool(verify_abelian_bianchi_identity(maxwell)),
        },
        {
            "name": "Scalar equation includes kinetic and potential contributions",
            "pass": bool(
                scalar_eom != 0
                and any(str(symbol) == "lambda_h" for symbol in scalar_v.free_symbols)
            ),
        },
        {
            "name": "Original curvature term requires dimensionful normalization",
            "pass": dimension_of_monomial(R) == 2,
        },
        {
            "name": "Normalized Einstein-Hilbert term has dimension four",
            "pass": dimension_of_monomial(Mpl ** 2 * R / 2) == 4,
        },
    ]
    return {
        "ok": all(item["pass"] for item in checks),
        "version": VERSION,
        "lagrangian": str(ORIGINAL_LAGRANGIAN_DENSITY),
        "next": (
            "Specify the gauge groups/representations for F, G and W "
            "and normalize the original action."
        ),
        "fields": [
            {
                "symbol": field.symbol,
                "meaning": field.meaning,
                "status": field.status,
            }
            for field in FIELD_REGISTRY
        ],
        "dimensions": check_term_dimensions(ORIGINAL_TERMS),
        "checks": checks,
        "scalarPotential": str(scalar_v),
        "scalarEom": str(scalar_eom),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V4 Unified Field Theory symbolic research scaffold")
    parser.add_argument("--derive-maxwell", action="store_true", help="derive the Abelian gauge equations symbolically")
    parser.add_argument("--derive-su2", action="store_true", help="construct SU(2) Yang-Mills field strengths and equations")
    parser.add_argument("--all", action="store_true", help="run all derivations")
    parser.add_argument("--self-test", action="store_true", help="run symbolic consistency tests")
    parser.add_argument("--json", action="store_true", help="print a dashboard JSON snapshot and exit")
    args = parser.parse_args()

    if args.json:
        import json
        report = json_report()
        print(json.dumps(report))
        return 0 if report["ok"] else 1


    print(f"V4 UNIFIED FIELD THEORY — RESEARCH SCAFFOLD v{VERSION}")
    print("=" * 62)
    print("Original image Lagrangian density (structure preserved):")
    print("  L_V4 =", sp.pretty(ORIGINAL_LAGRANGIAN_DENSITY))

    print("\nOriginal-term mass-dimension audit (4D natural units):")
    for message in check_term_dimensions(ORIGINAL_TERMS):
        print("  -", message)

    print("\nNormalized comparison baseline:")
    print("  L_base =", sp.pretty(BASELINE_LAGRANGIAN_DENSITY))
    print("\nBaseline mass-dimension audit:")
    for message in check_term_dimensions(BASELINE_TERMS):
        print("  -", message)

    lagrangian, potential, scalar_eom = scalar_field_demo()
    print("\nReal scalar-field demonstration (not the full Higgs doublet):")
    print("  V(h) =", sp.pretty(potential))
    print("  Euler–Lagrange expression = 0:")
    print("  ", sp.pretty(scalar_eom))

    print("\nFormal normalized-baseline field equations:")
    for name, equation in FORMAL_FIELD_EQUATIONS.items():
        print(f"  {name}: {equation}")

    do_all = args.all
    if args.derive_maxwell or do_all:
        print_maxwell_report()
    if args.derive_su2 or do_all:
        print_su2_report()
    if args.self_test:
        return 0 if self_test() else 1

    print("\nStatus: original F/G/W meanings remain unassigned; no new physical prediction claimed.")
    print("Next V4 theory decision: specify the gauge groups/representations and normalize the original action.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
