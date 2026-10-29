
"""
V4 Unified Field Theory — Gravity & Conservation
Version 1.0

Install:
    python -m pip install sympy

Run:
    python v4_gravity_sector.py --self-test
    python v4_gravity_sector.py --derive
    python v4_gravity_sector.py --show-components

Scope:
    Spatially flat FLRW spacetime with a homogeneous real scalar.

    The reduced gravitational action includes the Einstein-Hilbert
    contribution with the boundary term removed. The lapse N(t)
    is varied before choosing N = 1.

    This tests a gravitational sector; it does not yet derive
    the full general-metric equations for all V4 fields.
"""

import argparse
import sympy as sp


# ============================================================
# 1. CANONICAL V4 EQUATION — PRESERVED
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


# ============================================================
# 2. SYMBOLS AND REDUCED FLRW ACTION
# ============================================================

t = sp.symbols("t", real=True)

a = sp.Function("a")(t)     # Scale factor
N = sp.Function("N")(t)     # Lapse
h = sp.Function("h")(t)     # Homogeneous real scalar

Mpl, Lambda = sp.symbols(
    "M_Pl Lambda",
    positive=True,
    real=True,
)

mu2, lam = sp.symbols(
    "mu_H2 lambda_H",
    positive=True,
    real=True,
)

adot = sp.diff(a, t)
addot = sp.diff(a, t, 2)

hdot = sp.diff(h, t)
hddot = sp.diff(h, t, 2)

# A scalar-potential example. Its parameters are illustrative,
# not fitted parameters of the proposed V4 theory.
V = -mu2 * h**2 / 2 + lam * h**4 / 4

Vprime = sp.diff(V, h)

# Spatially flat FLRW minisuperspace action:
#
# L_gravity = -3 M_Pl^2 a adot^2/N
#             - M_Pl^2 Lambda N a^3
#
# L_scalar  = a^3 hdot^2/(2N) - N a^3 V(h)
#
# The convention is selected so the N=1 constraint becomes
# 3 M_Pl^2 H^2 = rho + M_Pl^2 Lambda.

L_gravity = (
    -3 * Mpl**2 * a * adot**2 / N
    - Mpl**2 * Lambda * N * a**3
)

L_scalar = (
    a**3 * hdot**2 / (2 * N)
    - N * a**3 * V
)

L_total = sp.expand(L_gravity + L_scalar)


# ============================================================
# 3. VARIATIONAL OPERATORS
# ============================================================

def euler_lagrange(L, field):
    """
    Standard Euler-Lagrange expression:

        dL/d(field) - d/dt[dL/d(field_dot)]

    Set the returned expression to zero.
    """
    return sp.simplify(
        sp.diff(L, field)
        - sp.diff(
            sp.diff(L, sp.diff(field, t)),
            t,
        )
    )


def derive_equations():
    # Vary the lapse before choosing N = 1.
    lapse_variation = sp.simplify(
        sp.diff(L_total, N)
    )

    # Standard EL expressions for a and h.
    scale_variation = euler_lagrange(L_total, a)
    scalar_variation = euler_lagrange(L_total, h)

    # Choose cosmic time only after the variations.
    cosmic_time = {
        N: sp.Integer(1),
        sp.diff(N, t): sp.Integer(0),
        sp.diff(N, t, 2): sp.Integer(0),
    }

    # Normalize the lapse constraint by a^3.
    # The equation remains equal to zero.
    constraint_from_action = sp.factor(
        lapse_variation.subs(N, 1) / a**3
    )

    # Normalize the scale-factor equation by 3 a^2.
    scale_from_action = sp.factor(
        scale_variation.subs(cosmic_time) / (3 * a**2)
    )

    # Multiply the scalar EL equation by -1 and divide by a^3
    # to display the standard Klein-Gordon sign convention.
    scalar_from_action = sp.factor(
        -scalar_variation.subs(cosmic_time) / a**3
    )

    H = adot / a

    # Expected compact equations from the same reduced action.
    rho = hdot**2 / 2 + V
    pressure = hdot**2 / 2 - V

    friedmann = sp.simplify(
        3 * Mpl**2 * H**2
        - Mpl**2 * Lambda
        - rho
    )

    acceleration = sp.simplify(
        2 * Mpl**2 * addot / a
        + Mpl**2 * H**2
        - Mpl**2 * Lambda
        + pressure
    )

    scalar_equation = sp.simplify(
        hddot + 3 * H * hdot + Vprime
    )

    # Combination of Friedmann and scale-factor equations:
    # 2 M_Pl^2 * dot(H) + rho + pressure = 0.
    raychaudhuri = sp.simplify(
        2 * Mpl**2 * (addot / a - H**2)
        + rho
        + pressure
    )

    # Local energy-conservation expression:
    # dot(rho) + 3H(rho + pressure) = 0.
    continuity = sp.simplify(
        sp.diff(rho, t)
        + 3 * H * (rho + pressure)
    )

    # For the scalar sector, continuity must equal
    # hdot times the scalar equation of motion.
    continuity_identity = sp.simplify(
        continuity - hdot * scalar_equation
    )

    return {
        "lapse_variation": lapse_variation,
        "scale_variation": scale_variation,
        "scalar_variation": scalar_variation,
        "constraint_from_action": constraint_from_action,
        "scale_from_action": scale_from_action,
        "scalar_from_action": scalar_from_action,
        "rho": rho,
        "pressure": pressure,
        "H": H,
        "friedmann": friedmann,
        "acceleration": acceleration,
        "scalar_equation": scalar_equation,
        "raychaudhuri": raychaudhuri,
        "continuity": continuity,
        "continuity_identity": continuity_identity,
    }


# ============================================================
# 4. CONSISTENCY TESTS
# ============================================================

def self_test(eq):
    # 1. The lapse variation must yield the Friedmann constraint.
    constraint_difference = sp.simplify(
        eq["constraint_from_action"] - eq["friedmann"]
    )

    assert constraint_difference == 0, (
        "Lapse variation does not match the Friedmann constraint."
    )

    # 2. The scale-factor variation must yield the
    # acceleration equation.
    acceleration_difference = sp.simplify(
        eq["scale_from_action"] - eq["acceleration"]
    )

    assert acceleration_difference == 0, (
        "Scale-factor variation does not match the acceleration equation."
    )

    # 3. The scalar variation must yield the Klein-Gordon equation.
    scalar_difference = sp.simplify(
        eq["scalar_from_action"] - eq["scalar_equation"]
    )

    assert scalar_difference == 0, (
        "Scalar variation does not match the scalar equation."
    )

    # 4. Combining the Friedmann and acceleration equations
    # must give the Raychaudhuri relation.
    ray_difference = sp.simplify(
        eq["acceleration"]
        - eq["friedmann"]
        - eq["raychaudhuri"]
    )

    assert ray_difference == 0, (
        "The gravitational equations do not combine consistently."
    )

    # 5. Scalar-field evolution must imply energy conservation.
    assert eq["continuity_identity"] == 0, (
        "Scalar continuity identity failed."
    )

    print("V4 gravity-sector self-tests passed.")
    print("Lapse variation / Friedmann equation: PASS")
    print("Scale-factor variation / acceleration equation: PASS")
    print("Scalar variation / Klein-Gordon equation: PASS")
    print("Gravitational equation combination: PASS")
    print("Scalar energy-conservation identity: PASS")


# ============================================================
# 5. REPORT
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 gravitational variation and conservation"
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

    eq = derive_equations()

    print("V4 Unified Field Theory — Gravity & Conservation")
    print("Version 1.0")
    print("=" * 60)

    print("\nCanonical V4 equation preserved.")
    print("Test model: spatially flat FLRW + homogeneous scalar")
    print("Lapse varied before setting N = 1.")

    print("\nReduced action:")
    print("L = L_gravity + L_scalar")
    print("\nL_gravity:")
    print(sp.pretty(L_gravity))
    print("\nL_scalar:")
    print(sp.pretty(L_scalar))

    print("\nDerived field equations:")
    print(
        "Friedmann constraint: "
        "3 M_Pl^2 H^2 = rho + M_Pl^2 Lambda"
    )
    print(
        "Acceleration equation: "
        "2 M_Pl^2 a_ddot/a + M_Pl^2 H^2 "
        "- M_Pl^2 Lambda + pressure = 0"
    )
    print(
        "Scalar equation: "
        "h_ddot + 3 H h_dot + dV/dh = 0"
    )

    print("\nConservation check:")
    print(
        "rho_dot + 3 H (rho + pressure)"
        " = h_dot * (h_ddot + 3 H h_dot + dV/dh)"
    )
    print(
        "Therefore energy conservation holds when the "
        "scalar field equation holds."
    )

    print("\nGeneral-relativistic identity to check in the full theory:")
    print("nabla_mu G^(mu nu) = 0")
    print(
        "With constant Lambda and the full Einstein equation, "
        "this requires covariant conservation of the total "
        "stress-energy tensor on the matter equations of motion."
    )

    if args.derive or args.show_components:
        print("\nSymbolic expressions derived from the action:")

        for key in (
            "constraint_from_action",
            "scale_from_action",
            "scalar_from_action",
            "raychaudhuri",
            "continuity",
        ):
            print(f"\n{key}:")
            if args.show_components:
                print(sp.factor(eq[key]))
            else:
                print(
                    f"Generated ({len(str(eq[key]))} characters)"
                )

    if args.self_test:
        self_test(eq)


if __name__ == "__main__":
    main()
