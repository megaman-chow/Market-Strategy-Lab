
"""
V4 Unified Field Theory — Stress-Energy and Conservation
Version 1.2

Install:
    python -m pip install sympy

Run:
    python v4_stress_energy.py --self-test
    python v4_stress_energy.py --show-tensor
    python v4_stress_energy.py --gravity-source

Scope:
    - Standard Hilbert stress-energy expressions for gauge fields.
    - Stress-energy of real scalar components.
    - Symmetry and trace checks for gauge tensors in 4D.
    - Exact flat-spacetime scalar conservation identity.
    - Assembly of the comparison gravitational source.

The original V4 master equation remains unchanged.
This module does not claim to derive the full arbitrary-metric
V4 field equations.
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
# 2. TENSOR UTILITIES
# ============================================================

DIM = 4

ETA = sp.diag(1, -1, -1, -1)


def validate_metric(metric):
    """Validate an invertible symmetric 4x4 metric."""
    metric = sp.Matrix(metric)

    if metric.shape != (DIM, DIM):
        raise ValueError("Metric must be 4x4.")

    if metric != metric.T:
        raise ValueError("Metric must be symmetric.")

    if metric.det() == 0:
        raise ValueError("Metric must be invertible.")

    return metric


def raise_both_indices(F, metric):
    """
    Compute F^(mu nu) = g^(mu alpha) g^(nu beta) F_(alpha beta).
    """
    metric = validate_metric(metric)
    inverse = metric.inv()
    F = sp.Matrix(F)

    return [
        [
            sp.simplify(sum(
                inverse[mu, a]
                * inverse[nu, b]
                * F[a, b]
                for a in range(DIM)
                for b in range(DIM)
            ))
            for nu in range(DIM)
        ]
        for mu in range(DIM)
    ]


# ============================================================
# 3. GAUGE-FIELD STRESS-ENERGY
# ============================================================

def gauge_stress_energy(F, metric=ETA):
    """
    For L = -1/4 F_mu_nu F^mu_nu, return

      T_(mu nu) =
        -F_(mu alpha) F_nu^alpha
        + (1/4) g_(mu nu) F_(alpha beta) F^alpha beta.

    This convention uses signature (+---).
    F must be an antisymmetric tensor with lower indices.
    """
    metric = validate_metric(metric)
    inverse = metric.inv()
    F = sp.Matrix(F)

    F_up = raise_both_indices(F, metric)

    invariant = sp.simplify(sum(
        F[i, j] * F_up[i][j]
        for i in range(DIM)
        for j in range(DIM)
    ))

    T = sp.MutableDenseMatrix(DIM, DIM, [0] * 16)

    for mu in range(DIM):
        for nu in range(DIM):
            mixed_contraction = sum(
                F[mu, alpha]
                * sum(
                    inverse[alpha, beta] * F[nu, beta]
                    for beta in range(DIM)
                )
                for alpha in range(DIM)
            )

            T[mu, nu] = sp.simplify(
                -mixed_contraction
                + metric[mu, nu] * invariant / 4
            )

    return sp.Matrix(T)


def yang_mills_stress_energy(field_strengths, metric=ETA):
    """
    Sum the stress-energy tensors of the gauge components.

    field_strengths is a list of antisymmetric 4x4 matrices.
    For SU(2), supply the three gauge components.
    """
    total = sp.zeros(DIM, DIM)

    for F in field_strengths:
        total += gauge_stress_energy(F, metric)

    return total.applyfunc(sp.simplify)


# ============================================================
# 4. SCALAR-FIELD STRESS-ENERGY
# ============================================================

def scalar_stress_energy(
    derivatives,
    potential,
    metric=ETA,
):
    """
    For real scalar components phi_i, with

      L = (1/2) sum_i g^(mu nu) P_(i mu) P_(i nu) - V,

    return

      T_(mu nu) =
        sum_i P_(i mu) P_(i nu) - g_(mu nu) L.

    P_(i mu) can be ordinary derivatives or real components
    of properly defined gauge-covariant derivatives.
    """
    metric = validate_metric(metric)
    inverse = metric.inv()

    kinetic = sp.S.Zero

    for P in derivatives:
        if len(P) != DIM:
            raise ValueError(
                "Each scalar derivative must have four components."
            )

        kinetic += sp.Rational(1, 2) * sum(
            inverse[mu, nu] * P[mu] * P[nu]
            for mu in range(DIM)
            for nu in range(DIM)
        )

    lagrangian = sp.simplify(kinetic - potential)

    T = sp.MutableDenseMatrix(DIM, DIM, [0] * 16)

    for mu in range(DIM):
        for nu in range(DIM):
            kinetic_tensor = sum(
                P[mu] * P[nu]
                for P in derivatives
            )

            T[mu, nu] = sp.simplify(
                kinetic_tensor - metric[mu, nu] * lagrangian
            )

    return sp.Matrix(T), lagrangian


# ============================================================
# 5. SYMBOLIC GAUGE TENSOR EXAMPLE
# ============================================================

def make_antisymmetric_field(prefix="F"):
    """
    Build a symbolic antisymmetric tensor from six independent
    components. This guarantees F_(mu nu) = -F_(nu mu).
    """
    F = sp.zeros(DIM, DIM)

    for mu in range(DIM):
        for nu in range(mu + 1, DIM):
            value = sp.Symbol(f"{prefix}{mu}{nu}", real=True)
            F[mu, nu] = value
            F[nu, mu] = -value

    return F


def tensor_trace(T, metric=ETA):
    metric = validate_metric(metric)
    inverse = metric.inv()

    return sp.simplify(sum(
        inverse[mu, nu] * T[mu, nu]
        for mu in range(DIM)
        for nu in range(DIM)
    ))


def verify_symmetric(T):
    return all(
        sp.simplify(T[mu, nu] - T[nu, mu]) == 0
        for mu in range(DIM)
        for nu in range(DIM)
    )


# ============================================================
# 6. SCALAR ENERGY-CONSERVATION IDENTITY
# ============================================================

def scalar_conservation_test():
    """
    Check the exact off-shell identity in flat spacetime:

      partial^mu T_(mu nu)
        = [Box(phi) + dV/dphi] partial_nu phi.

    Hence the stress-energy is conserved if the scalar field
    equation holds.
    """
    coords = sp.symbols("t x y z", real=True)

    phi = sp.Function("phi")(*coords)

    mass2, quartic = sp.symbols(
        "mass2 quartic",
        real=True,
    )

    potential = (
        mass2 * phi**2 / 2
        + quartic * phi**4 / 4
    )

    derivatives = [
        sp.diff(phi, coordinate)
        for coordinate in coords
    ]

    T, _ = scalar_stress_energy(
        [derivatives],
        potential,
        ETA,
    )

    box_phi = sum(
        ETA[mu, mu] * sp.diff(phi, coords[mu], 2)
        for mu in range(DIM)
    )

    equation = sp.simplify(
        box_phi + sp.diff(potential, phi)
    )

    residuals = []

    for nu in range(DIM):
        divergence = sp.simplify(sum(
            ETA[mu, mu]
            * sp.diff(T[mu, nu], coords[mu])
            for mu in range(DIM)
        ))

        residual = sp.simplify(
            sp.expand(
                divergence
                - equation * sp.diff(phi, coords[nu])
            )
        )

        residuals.append(residual)

    return residuals


# ============================================================
# 7. GRAVITATIONAL SOURCE ASSEMBLY
# ============================================================

def gravity_source_equation():
    """
    Compact comparison equation for the normalized action:

      M_Pl^2 (G_mu_nu + Lambda g_mu_nu) = T_mu_nu.

    T_total must include every appropriate matter and gauge
    contribution, with a consistent convention.
    """
    return (
        "M_Pl^2 (G_mu_nu + Lambda*g_mu_nu) "
        "= T_total_mu_nu"
    )


# ============================================================
# 8. SELF-TESTS
# ============================================================

def self_test():
    F = make_antisymmetric_field("F")
    T_gauge = gauge_stress_energy(F, ETA)

    # A valid Hilbert stress-energy tensor is symmetric.
    assert verify_symmetric(T_gauge), (
        "Gauge stress-energy tensor is not symmetric."
    )

    # In four dimensions, the classical gauge kinetic tensor
    # has zero trace for this minimally coupled action.
    assert tensor_trace(T_gauge, ETA) == 0, (
        "Four-dimensional gauge stress-energy trace is nonzero."
    )

    # Test an SU(2) sum of three independent gauge tensors.
    su2_fields = [
        make_antisymmetric_field(f"W{a}_")
        for a in range(3)
    ]

    T_su2 = yang_mills_stress_energy(su2_fields, ETA)

    assert verify_symmetric(T_su2), (
        "SU(2) stress-energy tensor is not symmetric."
    )

    assert tensor_trace(T_su2, ETA) == 0, (
        "SU(2) stress-energy trace is nonzero."
    )

    # Test scalar-field stress-energy symmetry.
    coords = sp.symbols("t x y z", real=True)
    phi = sp.Function("phi")(*coords)

    derivatives = [
        sp.diff(phi, coordinate)
        for coordinate in coords
    ]

    mass2, quartic = sp.symbols(
        "mass2 quartic",
        real=True,
    )

    potential = (
        mass2 * phi**2 / 2
        + quartic * phi**4 / 4
    )

    T_scalar, _ = scalar_stress_energy(
        [derivatives],
        potential,
        ETA,
    )

    assert verify_symmetric(T_scalar), (
        "Scalar stress-energy tensor is not symmetric."
    )

    # Test exact conservation identity in the scalar sector.
    assert all(
        residual == 0
        for residual in scalar_conservation_test()
    ), "Scalar conservation identity failed."

    print("V4 stress-energy self-tests passed.")
    print("U(1) tensor symmetry: PASS")
    print("U(1) trace in four dimensions: PASS")
    print("SU(2) tensor symmetry: PASS")
    print("SU(2) trace in four dimensions: PASS")
    print("Scalar tensor symmetry: PASS")
    print("Scalar conservation identity: PASS")


# ============================================================
# 9. COMMAND-LINE INTERFACE
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="V4 stress-energy and conservation checks"
    )

    parser.add_argument(
        "--self-test",
        action="store_true",
    )

    parser.add_argument(
        "--show-tensor",
        action="store_true",
    )

    parser.add_argument(
        "--gravity-source",
        action="store_true",
    )

    args = parser.parse_args()

    print("V4 — Stress-Energy and Conservation")
    print("Version 1.2")
    print("=" * 60)

    print("\nOriginal V4 master equation preserved.")
    print("Metric signature: (+---)")

    if args.show_tensor:
        F = make_antisymmetric_field("F")
        T = gauge_stress_energy(F, ETA)

        print("\nSymbolic gauge stress-energy tensor:")
        sp.pprint(T)

        print("\nSymbolic trace:")
        sp.pprint(tensor_trace(T, ETA))

    if args.gravity_source:
        print("\nNormalized comparison gravitational source:")
        print(gravity_source_equation())

        print(
            "\nT_total must include gauge, scalar, and fermion "
            "contributions from one consistently specified action."
        )

    if args.self_test:
        self_test()

    if not (
        args.self_test
        or args.show_tensor
        or args.gravity_source
    ):
        print("\nRun with --self-test, --show-tensor,")
        print("or --gravity-source to inspect the model.")


if __name__ == "__main__":
    main()
