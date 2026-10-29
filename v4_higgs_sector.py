
"""
V4 Unified Field Theory — Higgs-Doublet Sector
Version 0.4

Install:
    python -m pip install sympy

Run:
    python v4_higgs_sector.py
    python v4_higgs_sector.py --self-test
    python v4_higgs_sector.py --derive
    python v4_higgs_sector.py --show-components

IMPORTANT:
- The original V4 master equation is preserved symbolically.
- The Higgs-doublet realization is a proposed Standard Model-like
  interpretation of the scalar and gauge sectors.
- The Yukawa source J is a placeholder for gauge-compatible
  fermion bilinears, not the completed fermion sector.
- This module uses flat spacetime with signature (+---).
"""

import argparse
import sympy as sp


# ============================================================
# 1. ORIGINAL V4 MASTER EQUATION — PRESERVED
# ============================================================

R, F2, G2, W2 = sp.symbols(
    "R F2 G2 W2",
    real=True,
)

K_FERMION, K_HIGGS, V_HIGGS, YUKAWA = sp.symbols(
    "K_fermion K_Higgs V_Higgs Yukawa",
    real=True,
)

V4_ORIGINAL_LAGRANGIAN = (
    R
    - F2
    - G2
    - W2
    + K_FERMION
    + K_HIGGS
    - V_HIGGS
    - YUKAWA
)


# ============================================================
# 2. SPACETIME CONVENTIONS
# ============================================================

COORDS = sp.symbols("t x y z", real=True)

# Flat-spacetime demonstration only: (+---).
ETA = (1, -1, -1, -1)

I = sp.I


# ============================================================
# 3. HIGGS DOUBLEt AND GAUGE FIELDS
# ============================================================

def build_system():
    # Four real scalar components constitute two complex fields.
    h = [
        sp.Function(f"h{i}", real=True)(*COORDS)
        for i in range(1, 5)
    ]

    h1, h2, h3, h4 = h

    # H = ((h1 + i*h2), (h3 + i*h4)) / sqrt(2).
    Hnorm = sp.simplify(
        sum(component**2 for component in h) / 2
    )

    # Proposed electroweak gauge connections:
    # W_mu^a: SU(2)_L, a = 1, 2, 3
    # B_mu:   U(1)_Y
    W = [
        [
            sp.Function(
                f"W{a}_{mu}", real=True
            )(*COORDS)
            for mu in range(4)
        ]
        for a in range(3)
    ]

    B = [
        sp.Function(
            f"B_{mu}", real=True
        )(*COORDS)
        for mu in range(4)
    ]

    # Generic real components of a Higgs-doublet source.
    # J stands for the representation-compatible Yukawa
    # combinations once the fermion sector is specified.
    j = [
        sp.Function(
            f"J{i}", real=True
        )(*COORDS)
        for i in range(1, 5)
    ]

    # Gauge couplings, Higgs mass parameter and quartic coupling.
    g2, g1, mu2, lam = sp.symbols(
        "g_2 g_1 mu_H2 lambda_H",
        real=True,
    )

    # Proposed hypercharge of the Higgs doublet.
    YH = sp.Rational(1, 2)

    # Higgs potential:
    # V(H) = -mu_H2 * H†H + lambda_H * (H†H)^2.
    potential = (
        -mu2 * Hnorm
        + lam * Hnorm**2
    )

    # --------------------------------------------------------
    # 4. COVARIANT DERIVATIVE IN REAL COMPONENTS
    # --------------------------------------------------------
    #
    # D_mu H = [
    #   partial_mu
    #   - i*g2*W_mu^a*sigma^a/2
    #   - i*g1*YH*B_mu
    # ] H.
    #
    # Writing the real and imaginary parts explicitly avoids
    # ambiguities when SymPy differentiates complex conjugates.

    dh_components = []
    kinetic = sp.S.Zero

    for mu in range(4):
        a = (
            g1 * YH * B[mu]
            + g2 * W[2][mu] / 2
        )

        d = (
            g1 * YH * B[mu]
            - g2 * W[2][mu] / 2
        )

        b = g2 * W[0][mu] / 2
        c = g2 * W[1][mu] / 2

        # Real and imaginary components of D_mu H_1.
        dh1_re = (
            sp.diff(h1, COORDS[mu])
            + a * h2
            + b * h4
            - c * h3
        )

        dh1_im = (
            sp.diff(h2, COORDS[mu])
            - a * h1
            - b * h3
            - c * h4
        )

        # Real and imaginary components of D_mu H_2.
        dh2_re = (
            sp.diff(h3, COORDS[mu])
            + b * h2
            + c * h1
            + d * h4
        )

        dh2_im = (
            sp.diff(h4, COORDS[mu])
            - b * h1
            + c * h2
            - d * h3
        )

        dh_components.append((
            dh1_re,
            dh1_im,
            dh2_re,
            dh2_im,
        ))

        # (D_mu H)† D^mu H.
        kinetic += sp.Rational(1, 2) * ETA[mu] * (
            dh1_re**2
            + dh1_im**2
            + dh2_re**2
            + dh2_im**2
        )

    # --------------------------------------------------------
    # 5. GENERIC YUKAWA-SOURCE PLACEHOLDER
    # --------------------------------------------------------
    #
    # L_source = -(H†J + J†H)
    #           = -sum_k h_k J_k.
    #
    # J is a placeholder for the correctly contracted fermion
    # bilinears. It must be expanded using explicit fermion
    # representations before this becomes the full V4 Yukawa
    # sector.

    source = sum(
        h[index] * j[index]
        for index in range(4)
    )

    # Matter-sector Lagrangian in this proposed realization.
    lagrangian = sp.expand(
        kinetic - potential - source
    )

    return {
        "h": h,
        "W": W,
        "B": B,
        "j": j,
        "g2": g2,
        "g1": g1,
        "mu2": mu2,
        "lambda": lam,
        "Hnorm": Hnorm,
        "potential": potential,
        "kinetic": kinetic,
        "source": source,
        "dh_components": dh_components,
        "lagrangian": lagrangian,
    }


# ============================================================
# 6. EULER-LAGRANGE FIELD EQUATIONS
# ============================================================

def box(field):
    """Flat-spacetime d'Alembertian for signature (+---)."""
    return sum(
        ETA[mu] * sp.diff(
            field,
            COORDS[mu],
            2,
        )
        for mu in range(4)
    )


def euler_lagrange_equation(lagrangian, field):
    """
    Return E[field] = 0 in the convention that gives

        Box(h) + dV/dh + source = 0

    in the ungauged scalar limit.
    """
    result = sp.diff(lagrangian, field)

    for coordinate in COORDS:
        field_derivative = sp.diff(
            field,
            coordinate,
        )

        result -= sp.diff(
            sp.diff(
                lagrangian,
                field_derivative,
            ),
            coordinate,
        )

    return sp.simplify(-result)


def derive_component_equations(system):
    """Derive equations for all four real scalar components."""
    return [
        euler_lagrange_equation(
            system["lagrangian"],
            field,
        )
        for field in system["h"]
    ]


# ============================================================
# 7. CONSISTENCY CHECKS
# ============================================================

def self_test(system):
    h = system["h"]

    # Verify H†H for the chosen real-component representation.
    expected_norm = sum(
        component**2 for component in h
    ) / 2

    assert sp.simplify(
        system["Hnorm"] - expected_norm
    ) == 0

    # In the zero-gauge-coupling limit, the first component
    # must reduce to its scalar field equation with source.
    field = h[0]

    equation = euler_lagrange_equation(
        system["lagrangian"],
        field,
    )

    expected_equation = (
        box(field)
        + (
            -system["mu2"]
            + 2 * system["lambda"] * system["Hnorm"]
        ) * field
        + system["j"][0]
    )

    ungauged_equation = equation.subs({
        system["g1"]: 0,
        system["g2"]: 0,
    })

    assert sp.simplify(
        ungauged_equation - expected_equation
    ) == 0

    print("V4 Higgs-sector self-tests passed.")
    print("H†H normalization: verified.")
    print("Ungauged scalar equation: verified.")


# ============================================================
# 8. COMMAND-LINE INTERFACE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 Higgs-doublet research module"
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
    )

    parser.add_argument(
        "--derive",
        action="store_true",
        help="Derive all four real scalar equations.",
    )

    parser.add_argument(
        "--show-components",
        action="store_true",
        help="Print complete, potentially lengthy expressions.",
    )

    args = parser.parse_args()

    system = build_system()

    print("V4 — Higgs-Doublet Sector")
    print("=========================")

    print("\nOriginal V4 Lagrangian, unchanged:")
    print(sp.pretty(V4_ORIGINAL_LAGRANGIAN))

    print("\nWorking Higgs-doublet representation:")
    print(
        "H = ((h1 + i*h2)/sqrt(2), "
        "(h3 + i*h4)/sqrt(2))^T"
    )

    print("\nH†H:")
    print(sp.simplify(system["Hnorm"]))

    print("\nHiggs potential:")
    print(sp.pretty(system["potential"]))

    print("\nProposed covariant derivative:")
    print(
        "D_mu H = (partial_mu "
        "- i*g2*W_mu^a*sigma^a/2 "
        "- i*g1*YH*B_mu) H"
    )
    print("YH = 1/2")

    print("\nSource interaction:")
    print("L_source = -(H†J + J†H)")
    print(
        "J is a placeholder for representation-compatible "
        "fermion bilinears."
    )

    print("\nCompact Higgs equation:")
    print(
        "D_mu D^mu H "
        "+ (-mu_H2 + 2*lambda_H*H†H) H + J = 0"
    )

    print(
        "\nScope: flat spacetime (+---). The complete curved "
        "V4 action still requires its metric and gravitational "
        "covariant formulation."
    )

    if args.self_test:
        self_test(system)

    if args.derive or args.show_components:
        print("\nDeriving component field equations...")
        equations = derive_component_equations(system)

        print(
            f"Derived {len(equations)} real component equations."
        )

        if args.show_components:
            for index, equation in enumerate(
                equations,
                start=1,
            ):
                print(f"\nEquation for h{index}:")
                print(sp.factor(equation))
        else:
            print(
                "Use --show-components to inspect the "
                "full symbolic expressions."
            )


if __name__ == "__main__":
    main()
