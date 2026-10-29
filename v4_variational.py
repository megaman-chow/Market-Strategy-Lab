
"""
V4 Unified Field Theory — Variational Derivation
Version 0.7

Install:
    python -m pip install sympy

Run:
    python v4_variational.py --self-test
    python v4_variational.py --derive
    python v4_variational.py --show-components

This module derives the equations for a U(1) gauge field coupled
to a complex scalar field, using its explicit real components.

This is a test sector for V4's mathematical framework.
It does not assign specific gauge groups to F, G or W in the
original V4 equation.
"""

import argparse
import sympy as sp


# ============================================================
# 1. CANONICAL V4 EQUATION — ORIGINAL STRUCTURE PRESERVED
# ============================================================

V4_ORIGINAL_EQUATION = r"""
Z = integral D(Fields) exp(i S_V4)

S_V4 = integral d^4x sqrt(-g) [
    R
    - F_mu_nu F^mu_nu
    - G_mu_nu G^mu_nu
    - W_mu_nu W^mu_nu
    + sum_i psi_bar_i D psi_i
    + (D_mu H)^dagger D^mu H
    - V(H)
    - lambda_ij psi_bar_i H psi_j
]
"""

# The sector derived below is an explicit example, not a
# replacement for the original V4 master equation.


# ============================================================
# 2. SYMBOLS AND SPACETIME CONVENTIONS
# ============================================================

COORDS = sp.symbols("t x y z", real=True)

# Flat-spacetime metric signature (+---).
ETA = (1, -1, -1, -1)

q, mu2, lam = sp.symbols(
    "q mu2 lambda",
    real=True,
)

phi1 = sp.Function("phi1")(*COORDS)
phi2 = sp.Function("phi2")(*COORDS)

# Covariant components A_mu of the gauge potential.
A = [
    sp.Function(f"A{mu}")(*COORDS)
    for mu in range(4)
]

# Complex scalar:
# phi = (phi1 + i phi2) / sqrt(2)
#
# Therefore phi†phi = (phi1² + phi2²)/2.
rho = (phi1**2 + phi2**2) / 2


# ============================================================
# 3. EULER-LAGRANGE VARIATIONAL OPERATOR
# ============================================================

def euler_lagrange_equation(lagrangian, field):
    """
    Return the negative of the standard Euler-Lagrange
    expression. Its equation is still set equal to zero.

    This sign convention produces the familiar scalar equation:
        Box(phi) + dV/dphi = 0
    """
    canonical = sp.diff(lagrangian, field)

    for coordinate in COORDS:
        canonical -= sp.diff(
            sp.diff(
                lagrangian,
                sp.diff(field, coordinate),
            ),
            coordinate,
        )

    return sp.simplify(-canonical)


# ============================================================
# 4. CONSTRUCT THE COUPLED LAGRANGIAN
# ============================================================

def build_model():
    # --------------------------------------------------------
    # 4A. Abelian field-strength tensor
    #
    # F_mu_nu = partial_mu A_nu - partial_nu A_mu
    # --------------------------------------------------------

    F = [
        [
            sp.diff(A[nu], COORDS[mu])
            - sp.diff(A[mu], COORDS[nu])
            for nu in range(4)
        ]
        for mu in range(4)
    ]

    # Raise both tensor indices with the Minkowski metric.
    F_up = [
        [
            ETA[mu] * ETA[nu] * F[mu][nu]
            for nu in range(4)
        ]
        for mu in range(4)
    ]

    # L_gauge = -1/4 F_mu_nu F^mu_nu
    L_gauge = -sp.Rational(1, 4) * sum(
        F[mu][nu] * F_up[mu][nu]
        for mu in range(4)
        for nu in range(4)
    )

    # --------------------------------------------------------
    # 4B. Gauge-covariant scalar derivative
    #
    # D_mu phi = (partial_mu - i q A_mu) phi
    #
    # Its real and imaginary components are:
    # D_mu phi_1 = partial_mu phi_1 + q A_mu phi_2
    # D_mu phi_2 = partial_mu phi_2 - q A_mu phi_1
    # --------------------------------------------------------

    D_real = []
    D_imag = []

    for mu in range(4):
        D_real.append(
            sp.diff(phi1, COORDS[mu])
            + q * A[mu] * phi2
        )

        D_imag.append(
            sp.diff(phi2, COORDS[mu])
            - q * A[mu] * phi1
        )

    # L_scalar kinetic = (D_mu phi)† D^mu phi
    L_kinetic = sp.Rational(1, 2) * sum(
        ETA[mu] * (
            D_real[mu]**2
            + D_imag[mu]**2
        )
        for mu in range(4)
    )

    # Generic renormalizable scalar potential:
    # V = -mu²(phi†phi) + lambda(phi†phi)²
    V = -mu2 * rho + lam * rho**2

    L_scalar = L_kinetic - V

    # Total Lagrangian for this illustrative sector.
    L_total = L_gauge + L_scalar

    # --------------------------------------------------------
    # 4C. Gauge current from variation with respect to A_mu
    # --------------------------------------------------------
    #
    # J^nu = -partial L_matter / partial A_nu
    #
    # Here A contains covariant components. The metric factors
    # from the kinetic term already give the correct component
    # expression. Do not raise the index a second time.

    current = [
        sp.simplify(
            -sp.diff(L_scalar, A[nu])
        )
        for nu in range(4)
    ]

    # Divergence of the raised-index field-strength tensor.
    div_F = [
        sp.simplify(
            sum(
                sp.diff(F_up[mu][nu], COORDS[mu])
                for mu in range(4)
            )
        )
        for nu in range(4)
    ]

    # --------------------------------------------------------
    # 4D. Derive all Euler-Lagrange equations
    # --------------------------------------------------------

    scalar_eoms = [
        euler_lagrange_equation(L_total, phi1),
        euler_lagrange_equation(L_total, phi2),
    ]

    gauge_eoms = [
        euler_lagrange_equation(
            L_total,
            A[nu],
        )
        for nu in range(4)
    ]

    # --------------------------------------------------------
    # 4E. Noether identity for the scalar's U(1) symmetry
    # --------------------------------------------------------

    div_current = sp.simplify(
        sum(
            sp.diff(current[mu], COORDS[mu])
            for mu in range(4)
        )
    )

    # On the scalar equations of motion, this identity implies
    # conservation of the gauge current.
    noether_residual = sp.simplify(
        div_current
        - q * (
            phi1 * scalar_eoms[1]
            - phi2 * scalar_eoms[0]
        )
    )

    return {
        "F": F,
        "F_up": F_up,
        "L_gauge": L_gauge,
        "L_scalar": L_scalar,
        "L_total": L_total,
        "V": V,
        "current": current,
        "div_F": div_F,
        "scalar_eoms": scalar_eoms,
        "gauge_eoms": gauge_eoms,
        "noether_residual": noether_residual,
    }


# ============================================================
# 5. AUTOMATED CONSISTENCY TESTS
# ============================================================

def self_test(model):
    # Test 1: antisymmetry of the field-strength tensor.
    for mu in range(4):
        for nu in range(4):
            residual = sp.simplify(
                model["F"][mu][nu]
                + model["F"][nu][mu]
            )

            assert residual == 0

    # Test 2: the gauge equations must match the current
    # and field-strength divergence derived from the action.
    #
    # Our chosen sign convention yields:
    # J^nu - partial_mu F^(mu nu) = 0.

    for nu in range(4):
        expected = sp.simplify(
            model["current"][nu]
            - model["div_F"][nu]
        )

        assert sp.simplify(
            model["gauge_eoms"][nu] - expected
        ) == 0

    # Test 3: Noether identity.
    assert model["noether_residual"] == 0

    # Test 4: when q=0, the scalar equation must reduce to
    # Box(phi1) + dV/dphi1 = 0.

    decoupled = model["scalar_eoms"][0].subs(
        q, 0
    )

    box_phi1 = sum(
        ETA[mu] * sp.diff(
            phi1,
            COORDS[mu],
            2,
        )
        for mu in range(4)
    )

    expected_scalar = (
        box_phi1
        + (-mu2 + 2 * lam * rho) * phi1
    )

    assert sp.simplify(
        decoupled - expected_scalar
    ) == 0

    print("V4 variational self-tests passed.")
    print("Field-strength antisymmetry: PASS")
    print("Gauge Euler-Lagrange equations: PASS (4 components)")
    print("Noether current identity: PASS")
    print("Decoupled scalar limit: PASS")


# ============================================================
# 6. REPORT AND COMMAND-LINE INTERFACE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 coupled-sector variational derivation"
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
    )

    parser.add_argument(
        "--derive",
        action="store_true",
    )

    parser.add_argument(
        "--show-components",
        action="store_true",
    )

    args = parser.parse_args()

    model = build_model()

    print("V4 Variational Derivation — Version 0.7")
    print("========================================")
    print("Reference sector: U(1) gauge field + complex scalar")
    print("Metric signature: (+---)")

    print("\nLagrangian:")
    print("L = -1/4 F_mu_nu F^mu_nu")
    print("    + (D_mu phi)† D^mu phi - V(phi)")

    print("\nPotential:")
    print("V = -mu²(phi†phi) + lambda(phi†phi)²")

    print("\nDerived gauge equations:")
    for nu in range(4):
        print(
            f"  partial_mu F^(mu {nu}) = J^{nu}"
        )

    print("\nDerived gauge current:")
    print(
        "J^nu = q[phi1 partial^nu phi2"
        " - phi2 partial^nu phi1"
        " - q A^nu(phi1² + phi2²)]"
    )

    print("\nNoether identity:")
    print(
        "partial_mu J^mu = q("
        "phi1 E_phi2 - phi2 E_phi1)"
    )
    print(
        "Therefore, the current is conserved when "
        "both scalar equations of motion hold."
    )

    if args.derive or args.show_components:
        print("\nScalar equations of motion:")

        if args.show_components:
            for field, equation in zip(
                (phi1, phi2),
                model["scalar_eoms"],
            ):
                print(f"\n{field}:")
                print(sp.factor(equation))
        else:
            for field, equation in zip(
                (phi1, phi2),
                model["scalar_eoms"],
            ):
                print(
                    f"  {field}: derived successfully "
                    f"({len(str(equation))} characters)"
                )

    if args.self_test:
        self_test(model)


if __name__ == "__main__":
    main()
