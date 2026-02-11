import React, { useState, useEffect } from 'react';
import { db } from '../Firebase/config';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  doc, deleteDoc, updateDoc, writeBatch, getDocs, where 
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import './AdminPanel.css';

const AdminPanel = () => {
    const [categorias, setCategorias] = useState([]);
    const [productos, setProductos] = useState([]);
    const [nuevaCat, setNuevaCat] = useState('');
    const [cargando, setCargando] = useState(false);

    // --- SUSCRIPCIÓN A DATOS ---
    useEffect(() => {
        const qCat = query(collection(db, "categorias"), orderBy("nombre", "asc"));
        const unsubscribeCat = onSnapshot(qCat, (snap) => {
            setCategorias(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        });

        const unsubscribeProd = onSnapshot(collection(db, "productos"), (snap) => {
            setProductos(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        });

        return () => { unsubscribeCat(); unsubscribeProd(); };
    }, []);

    // --- LÓGICA DE CATEGORÍAS ---
    const crearCategoria = async () => {
        if (!nuevaCat.trim()) return;
        await addDoc(collection(db, "categorias"), { nombre: nuevaCat.trim() });
        setNuevaCat('');
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Categoría creada', showConfirmButton: false, timer: 2000 });
    };

    const editarCategoria = async (catId, viejoNombre) => {
        const { value: nuevoNombre } = await Swal.fire({
            title: 'Editar Categoría',
            input: 'text',
            inputValue: viejoNombre,
            confirmButtonColor: '#398F82',
            showCancelButton: true,
            inputValidator: (value) => !value && '¡El nombre es obligatorio!'
        });

        if (nuevoNombre && nuevoNombre.trim() !== viejoNombre) {
            setCargando(true);
            try {
                const batch = writeBatch(db);
                const q = query(collection(db, "productos"), where("categoria", "==", viejoNombre));
                const prodsSnap = await getDocs(q);
                prodsSnap.forEach((d) => batch.update(d.ref, { categoria: nuevoNombre.trim() }));
                batch.update(doc(db, "categorias", catId), { nombre: nuevoNombre.trim() });
                await batch.commit();
                Swal.fire('Actualizado', 'Categoría y productos actualizados', 'success');
            } catch (e) { console.error(e); } finally { setCargando(false); }
        }
    };

    const eliminarCategoria = async (catId, catNombre) => {
        const result = await Swal.fire({
            title: '¿Eliminar categoría?',
            text: `Se borrará "${catNombre}" y TODOS sus platos asociados.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#398F82',
            confirmButtonText: 'Sí, eliminar todo'
        });

        if (result.isConfirmed) {
            try {
                const batch = writeBatch(db);
                const q = query(collection(db, "productos"), where("categoria", "==", catNombre));
                const prodsSnap = await getDocs(q);
                prodsSnap.forEach((d) => batch.delete(d.ref));
                batch.delete(doc(db, "categorias", catId));
                await batch.commit();
                Swal.fire('Borrado', 'Categoría eliminada', 'success');
            } catch (e) { console.error(e); }
        }
    };

    // --- LÓGICA DE PRODUCTOS (MODAL SWEETALERT2) ---
    const abrirModalProducto = async (prod = null, nombreCategoria = null) => {
        const esEdicion = !!prod;
        
        const { value: formValues } = await Swal.fire({
            title: esEdicion ? 'Editar Plato' : `Nuevo en ${nombreCategoria}`,
            confirmButtonColor: '#398F82',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonText: 'Guardar Plato',
            html:
                `<input id="swal-name" class="swal2-input" placeholder="Nombre del plato" value="${esEdicion ? prod.nombre : ''}">` +
                `<input id="swal-price" type="number" class="swal2-input" placeholder="Precio" value="${esEdicion ? prod.precio : ''}">` +
                `<textarea id="swal-desc" class="swal2-textarea" placeholder="Descripción (ingredientes, tamaño...)" style="height:100px">${esEdicion ? (prod.descripcion || '') : ''}</textarea>` +
                `<div style="margin-top:10px; font-size:0.8rem; color:#666">Imagen del plato:</div>` +
                `<input id="swal-file" type="file" class="swal2-file" accept="image/*">`,
            preConfirm: () => {
                const nombre = document.getElementById('swal-name').value;
                const precio = document.getElementById('swal-price').value;
                const descripcion = document.getElementById('swal-desc').value;
                const archivo = document.getElementById('swal-file').files[0];

                if (!nombre || !precio) {
                    Swal.showValidationMessage('Nombre y Precio son obligatorios');
                    return false;
                }
                return { nombre, precio, descripcion, archivo };
            }
        });

        if (formValues) {
            guardarProducto(formValues, prod, nombreCategoria);
        }
    };

    const guardarProducto = async (valores, prodExistente, nombreCategoria) => {
        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            let urlImagenFinal = prodExistente ? prodExistente.imagen : '';

            if (valores.archivo) {
                const formData = new FormData();
                formData.append('file', valores.archivo);
                formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
                const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                urlImagenFinal = data.secure_url;
            }

            const datos = {
                nombre: valores.nombre,
                precio: parseFloat(valores.precio),
                descripcion: valores.descripcion,
                imagen: urlImagenFinal,
                categoria: prodExistente ? prodExistente.categoria : nombreCategoria
            };

            if (prodExistente) {
                await updateDoc(doc(db, "productos", prodExistente.id), datos);
            } else {
                await addDoc(collection(db, "productos"), datos);
            }

            Swal.fire('¡Éxito!', 'El plato se guardó correctamente', 'success');
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo subir la imagen o guardar los datos', 'error');
        }
    };

    const eliminarProducto = async (id) => {
        const res = await Swal.fire({
            title: '¿Eliminar este plato?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Sí, eliminar'
        });
        if (res.isConfirmed) {
            await deleteDoc(doc(db, "productos", id));
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Plato eliminado', showConfirmButton: false, timer: 1500 });
        }
    };

    return (
        <div className="admin-container">
            <div className="admin-header-logo">
                <img src="/vite.jpeg" alt="Logo" className="header-logo-img" />
            </div>
            
            <div className="category-form">
                <input 
                    className="admin-input" 
                    value={nuevaCat} 
                    onChange={(e) => setNuevaCat(e.target.value)} 
                    placeholder="Escribe una nueva categoría..." 
                />
                <button className="btn-primary" onClick={crearCategoria}>Crear</button>
            </div>

            {categorias.map(cat => (
                <div key={cat.id} className="admin-cat-card">
                    <div className="admin-cat-header">
                        <div className="cat-title-block">
                            <h2>{cat.nombre}</h2>
                                <button className="btn-edit" onClick={() => editarCategoria(cat.id, cat.nombre)} title="Editar nombre">✎</button>
                                <button className="btn-delete" onClick={() => eliminarCategoria(cat.id, cat.nombre)} title="Borrar categoría">✕</button>
                        </div>
                        <button className="btn-add" onClick={() => abrirModalProducto(null, cat.nombre)}>
                            + AGREGAR PLATO
                        </button>
                    </div>

                    <div className="admin-prod-list">
                        {productos.filter(p => p.categoria === cat.nombre).map(p => (
                            <div key={p.id} className="admin-prod-row">
                                <div className="prod-info-left">
                                    <div className="name-price-group">
                                        <span className="p-name">{p.nombre}</span>
                                        <span className="p-price">${p.precio}</span>
                                    </div>
                                    <p className="p-desc">{p.descripcion || "Sin descripción."}</p>
                                </div>

                                <div className="prod-img-center">
                                    <img src={p.imagen || 'https://via.placeholder.com/150'} alt={p.nombre} className="p-img" />
                                </div>

                                <div className="prod-btns-right">
                                    <button className="btn-edit1" onClick={() => abrirModalProducto(p)}>✎</button>
                                    <button className="btn-delete1" onClick={() => eliminarProducto(p.id)}>✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AdminPanel;